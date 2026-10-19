const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  safeStorage,
  session,
  shell,
  systemPreferences,
} = require("electron");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { loadDesktopSecrets } = require("./secrets.cjs");

// Electron itself may be launched from development shells that set Node-only
// flags. Packaged Electron does not support all NODE_OPTIONS values, and
// forwarding them to the embedded Node runtime can prevent the local API from
// starting. Keep the desktop runtime isolated from those shell settings.
delete process.env.NODE_OPTIONS;

const preferredApiPort = Number(process.env.CIRCULO_DESKTOP_API_PORT || 3322);
const preferredWebPort = Number(process.env.CIRCULO_DESKTOP_WEB_PORT || 3310);
let API_PORT = preferredApiPort;
let WEB_PORT = preferredWebPort;
let apiUrl = `http://127.0.0.1:${API_PORT}`;
let webUrl =
  process.env.CIRCULO_DESKTOP_WEB_URL || `http://127.0.0.1:${WEB_PORT}`;
// The desktop shell only ever renders the runtime it starts itself. Anything
// else is treated as an external link.
function isLocalRuntimeUrl(url) {
  try {
    const target = new URL(url);
    return (
      target.origin === new URL(webUrl).origin ||
      target.origin === new URL(apiUrl).origin
    );
  } catch {
    return false;
  }
}

function isWebRuntimeOrigin(originOrUrl) {
  try {
    return new URL(originOrUrl).origin === new URL(webUrl).origin;
  } catch {
    return false;
  }
}

const children = [];
let mainWindow;
let runtimeStatus = "starting";
let updateStatus = "idle";
let autoUpdater;
let apiStderr = "";

// A desktop runtime owns fixed loopback ports and a local database. Running
// more than one copy at once creates port races and, for PGlite, database
// locks. Let the existing instance handle subsequent launches instead.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function writeDesktopLog(message) {
  try {
    const logPath = path.join(app.getPath("userData"), "desktop.log");
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Diagnostics must never prevent the desktop app from starting.
  }
}

function probeLocalPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    const onError = (error) => {
      server.removeListener("listening", onListening);
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(null);
      } else {
        reject(error);
      }
    };
    const onListening = () => {
      const address = server.address();
      const availablePort =
        address && typeof address === "object" ? address.port : null;
      server.removeListener("error", onError);
      server.close((error) => {
        if (error) reject(error);
        else resolve(availablePort);
      });
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

async function selectRuntimePort(preferredPort, excludedPorts = new Set()) {
  if (
    Number.isInteger(preferredPort) &&
    preferredPort > 0 &&
    preferredPort <= 65535 &&
    !excludedPorts.has(preferredPort)
  ) {
    const preferred = await probeLocalPort(preferredPort);
    if (preferred !== null) return preferred;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const available = await probeLocalPort(0);
    if (available !== null && !excludedPorts.has(available)) return available;
  }

  throw new Error("Could not find available loopback ports for Circulo.");
}

async function configureRuntimePorts() {
  API_PORT = await selectRuntimePort(preferredApiPort);
  WEB_PORT = await selectRuntimePort(preferredWebPort, new Set([API_PORT]));
  apiUrl = `http://127.0.0.1:${API_PORT}`;
  webUrl =
    process.env.CIRCULO_DESKTOP_WEB_URL || `http://127.0.0.1:${WEB_PORT}`;

  if (API_PORT !== preferredApiPort || WEB_PORT !== preferredWebPort) {
    writeDesktopLog(
      `desktop runtime ports selected api=${API_PORT} web=${WEB_PORT} (default ports were unavailable)`,
    );
  }
}

function workspaceRoot() {
  return (
    process.env.CIRCULO_DESKTOP_REPO ||
    (app.isPackaged
      ? path.join(process.resourcesPath, "runtime")
      : path.resolve(__dirname, "../../.."))
  );
}

function spawnProcess(command, args, env, cwd, { onStderr, role } = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "pipe",
    windowsHide: true,
  });
  child.circuloRole = role;
  child.stdout.on("data", (chunk) => {
    const output = String(chunk);
    process.stdout.write(`[desktop:${command}] ${output}`);
    writeDesktopLog(`[${command}:stdout] ${output.trimEnd()}`);
  });
  child.stderr.on("data", (chunk) => {
    const output = String(chunk);
    onStderr?.(output);
    process.stderr.write(`[desktop:${command}] ${output}`);
    writeDesktopLog(`[${command}:stderr] ${output.trimEnd()}`);
  });
  child.on("error", (error) => {
    runtimeStatus = "error";
    writeDesktopLog(
      `[${command}] spawn error: ${error.stack || error.message}`,
    );
    console.error(`[desktop:${command}] failed to spawn:`, error);
  });
  child.on("exit", (code, signal) => {
    console.log(`[desktop:${command}] exited with code ${code ?? "null"}`);
    const wasReady = runtimeStatus === "ready";
    if ((code !== 0 || signal) && runtimeStatus !== "stopping") {
      runtimeStatus = "error";
      writeDesktopLog(
        `[${command}] exited unexpectedly with code ${code ?? "null"} signal ${signal ?? "none"}`,
      );
      if (mainWindow)
        mainWindow.webContents.send("circulo:runtime-status", runtimeStatus);

      if (role === "api" && wasReady && hasRecoverablePgliteStartupFailure()) {
        void recoverDatabaseStartup()
          .then(async (recovered) => {
            if (recovered === true) {
              apiStderr = "";
              runtimeStatus = "ready";
              mainWindow?.webContents.send(
                "circulo:runtime-status",
                runtimeStatus,
              );
              await mainWindow?.loadURL(webUrl);
              return;
            }
            if (recovered === false) app.quit();
          })
          .catch((error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            writeDesktopLog(
              `database recovery failed: ${error?.stack || message}`,
            );
            dialog.showErrorBox(
              "Circulo local data could not be recovered",
              message,
            );
            app.quit();
          });
      }
    }
  });
  children.push(child);
  return child;
}

function startLocalRuntime() {
  apiStderr = "";
  const root = workspaceRoot();
  const bun = process.env.CIRCULO_DESKTOP_BUN || "bun";
  const node = process.env.CIRCULO_DESKTOP_NODE || "node";
  const secrets = loadDesktopSecrets({ app, safeStorage });
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const common = {
    NODE_ENV: "development",
    HOSTNAME: "127.0.0.1",
    CIRCULO_DEPLOYMENT_MODE: "local",
    CIRCULO_RUNTIME_KIND: "desktop",
    NEXT_PUBLIC_CIRCULO_RUNTIME_KIND: "desktop",
    CIRCULO_DATABASE_DRIVER: "pglite",
    DATABASE_URL: "pglite://desktop",
    PGLITE_DATA_DIR: path.join(dataDir, "pglite"),
    CIRCULO_MIGRATIONS_PATH: path.join(
      root,
      app.isPackaged ? "db/migrations" : "packages/db/migrations",
    ),
    CIRCULO_STORAGE_DRIVER: "local",
    CIRCULO_LOCAL_STORAGE_PATH: path.join(dataDir, "storage"),
    BILLING_ENABLED: "false",
    BETTER_AUTH_URL: apiUrl,
    NEXT_PUBLIC_BETTER_AUTH_URL: apiUrl,
    SERVER_API_URL: apiUrl,
    NEXT_PUBLIC_APP_URL: webUrl,
    NEXT_PUBLIC_BILLING_ENABLED: "false",
    ...secrets,
  };

  if (!process.env.CIRCULO_DESKTOP_SKIP_SERVER) {
    if (app.isPackaged) {
      spawnProcess(
        process.execPath,
        [path.join(root, "server", "node-server.js")],
        {
          ...common,
          ELECTRON_RUN_AS_NODE: "1",
          PORT: String(API_PORT),
        },
        root,
        { onStderr: (output) => (apiStderr += output), role: "api" },
      );
    } else {
      spawnProcess(
        bun,
        ["--cwd", path.join(root, "apps/server"), "dev"],
        {
          ...common,
          PORT: String(API_PORT),
        },
        root,
        { onStderr: (output) => (apiStderr += output), role: "api" },
      );
    }
  }

  if (!process.env.CIRCULO_DESKTOP_SKIP_WEB) {
    if (app.isPackaged) {
      spawnProcess(
        process.execPath,
        [path.join(root, "web", "apps", "web", "server.js")],
        {
          ...common,
          ELECTRON_RUN_AS_NODE: "1",
          PORT: String(WEB_PORT),
          HOSTNAME: "127.0.0.1",
        },
        path.join(root, "web", "apps", "web"),
        { role: "web" },
      );
    } else {
      spawnProcess(
        node,
        [
          path.join(root, "apps/web/node_modules/next/dist/bin/next"),
          "dev",
          "--webpack",
          "-H",
          "127.0.0.1",
          "-p",
          String(WEB_PORT),
        ],
        {
          ...common,
          PORT: String(WEB_PORT),
          SERVER_API_URL: apiUrl,
          NEXT_PUBLIC_BETTER_AUTH_URL: apiUrl,
        },
        path.join(root, "apps/web"),
        { role: "web" },
      );
    }
  }
}

function configureAutoUpdates() {
  if (!app.isPackaged) return;
  const updateUrl = process.env.CIRCULO_UPDATE_URL?.trim();
  if (!updateUrl) {
    updateStatus = "unconfigured";
    console.info("[desktop] auto-update feed is not configured");
    return;
  }

  try {
    const parsedUpdateUrl = new URL(updateUrl);
    if (parsedUpdateUrl.protocol !== "https:") {
      throw new Error("CIRCULO_UPDATE_URL must use HTTPS");
    }
  } catch (error) {
    updateStatus = "error";
    console.error("[desktop] auto-update feed URL is invalid", error);
    return;
  }

  try {
    ({ autoUpdater } = require("electron-updater"));
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    for (const event of [
      "checking-for-update",
      "update-available",
      "update-not-available",
      "download-progress",
      "update-downloaded",
      "error",
    ]) {
      autoUpdater.on(event, (info) => {
        updateStatus = event;
        if (mainWindow)
          mainWindow.webContents.send("circulo:update-status", { event, info });
      });
    }
    autoUpdater.setFeedURL({ provider: "generic", url: updateUrl });
    void autoUpdater.checkForUpdates().catch((error) => {
      updateStatus = "error";
      console.error("[desktop] update check failed", error);
    });
  } catch (error) {
    console.error("[desktop] auto-update is unavailable", error);
  }
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Runtime is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    // Keep the operating-system window controls native while allowing the
    // renderer to provide a compact, app-specific toolbar in the title area.
    ...(process.platform === "win32" || process.platform === "darwin"
      ? {
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#18181b",
            symbolColor: "#a1a1aa",
            height: 40,
          },
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Chromium's built-in PDF viewer is a plugin; attachment previews need it.
      plugins: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      if (errorCode !== -3) {
        runtimeStatus = "error";
        dialog.showErrorBox("Circulo could not start", errorDescription);
      }
    },
  );
  // Never open a third-party page inside the Electron window: a child window
  // inherits this window's preload, which would expose the circuloDesktop IPC
  // bridge (including installUpdate) to that origin. External links go to the
  // user's own browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  // Keep the main window pinned to the bundled local runtime for the same
  // reason: an in-place navigation would carry the preload bridge with it.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isLocalRuntimeUrl(url)) return;
    event.preventDefault();
    if (url.startsWith("https://")) void shell.openExternal(url);
  });

  return mainWindow.loadURL(webUrl);
}

function stopRuntime() {
  runtimeStatus = "stopping";
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (
      child.circuloRole === "api" &&
      child.stdin &&
      !child.stdin.destroyed &&
      !child.stdin.writableEnded
    ) {
      child.stdin.end("CIRCULO_DESKTOP_SHUTDOWN\n");
      continue;
    }
    child.kill();
  }
}

async function stopRuntimeAndWait() {
  stopRuntime();
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          let finished = false;
          let forceKillTimeout;
          let finalTimeout;
          const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(forceKillTimeout);
            clearTimeout(finalTimeout);
            resolve();
          };
          if (child.exitCode !== null || child.signalCode !== null) {
            finish();
            return;
          }
          forceKillTimeout = setTimeout(() => {
            child.kill("SIGKILL");
            finalTimeout = setTimeout(finish, 5_000);
          }, 10_000);
          child.once("exit", () => {
            finish();
          });
        }),
    ),
  );
  children.length = 0;
}

function hasRecoverablePgliteStartupFailure() {
  return (
    apiStderr.includes("RuntimeError: Aborted()") &&
    apiStderr.includes("wasm://wasm/")
  );
}

function createDatabaseBackupPath(dataDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(dataDir, `pglite-backup-${timestamp}`);
  let candidate = base;
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

async function recoverDatabaseStartup() {
  const dataDir = path.join(app.getPath("userData"), "data");
  const databaseDir = path.join(dataDir, "pglite");
  if (
    !app.isPackaged ||
    !fs.existsSync(databaseDir) ||
    !hasRecoverablePgliteStartupFailure()
  ) {
    return null;
  }

  const backupDir = createDatabaseBackupPath(dataDir);
  const { response } = await dialog.showMessageBox({
    type: "error",
    title: "Local database could not be opened",
    message:
      "Circulo could not open this desktop installation’s local database.",
    detail: `You can quit or move the database to a backup and start a fresh local profile. The backup will be kept at:\n\n${backupDir}\n\nYour existing local account and data will not appear in the fresh profile. The backup will not be deleted.`,
    buttons: ["Back Up Data & Start Fresh", "Quit"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return false;

  await stopRuntimeAndWait();
  fs.renameSync(databaseDir, backupDir);
  writeDesktopLog(`moved unreadable local database to ${backupDir}`);
  startLocalRuntime();
  await waitForUrl(`${apiUrl}/health`);
  await waitForUrl(webUrl);
  return true;
}

ipcMain.handle("circulo:runtime-info", () => ({
  apiUrl,
  webUrl,
  dataPath: path.join(app.getPath("userData"), "data"),
  status: runtimeStatus,
  updateStatus,
}));
ipcMain.handle("circulo:navigation-state", () => ({
  canGoBack: Boolean(mainWindow?.webContents.navigationHistory.canGoBack()),
  canGoForward: Boolean(
    mainWindow?.webContents.navigationHistory.canGoForward(),
  ),
}));
ipcMain.handle("circulo:clipboard-write-text", (event, text) => {
  if (event.sender !== mainWindow?.webContents) {
    throw new Error("Clipboard access is only available to the app window.");
  }
  if (typeof text !== "string") {
    throw new TypeError("Clipboard text must be a string.");
  }

  clipboard.writeText(text);
});
ipcMain.handle("circulo:clipboard-write-image", (event, dataUrl) => {
  if (event.sender !== mainWindow?.webContents) {
    throw new Error("Clipboard access is only available to the app window.");
  }
  if (
    typeof dataUrl !== "string" ||
    dataUrl.length > 64 * 1024 * 1024 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)
  ) {
    throw new TypeError("Clipboard image must be a valid PNG data URL.");
  }

  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) throw new TypeError("Clipboard image is invalid.");
  clipboard.writeImage(image);
});
ipcMain.on("circulo:titlebar-theme", (event, theme) => {
  if (event.sender !== mainWindow?.webContents) return;
  if (theme !== "dark" && theme !== "light") return;
  if (typeof mainWindow.setTitleBarOverlay !== "function") return;

  mainWindow.setTitleBarOverlay({
    color: theme === "dark" ? "#0d0d0d" : "#ffffff",
    symbolColor: theme === "dark" ? "#a1a1aa" : "#71717a",
    height: 40,
  });
});
ipcMain.on("circulo:navigate-back", () => {
  if (mainWindow?.webContents.navigationHistory.canGoBack())
    mainWindow.webContents.navigationHistory.goBack();
});
ipcMain.on("circulo:navigate-forward", () => {
  if (mainWindow?.webContents.navigationHistory.canGoForward())
    mainWindow.webContents.navigationHistory.goForward();
});
ipcMain.handle("circulo:download-update", async () => {
  if (!autoUpdater) return { started: false };
  await autoUpdater.downloadUpdate();
  return { started: true };
});
ipcMain.handle("circulo:install-update", () => {
  if (!autoUpdater) return false;
  autoUpdater.quitAndInstall(false, true);
  return true;
});

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    try {
      session.defaultSession.setPermissionCheckHandler(
        (_webContents, permission, requestingOrigin, details) => {
          if (!details.isMainFrame || !isWebRuntimeOrigin(requestingOrigin)) {
            return false;
          }
          if (permission === "media") return details.mediaType === "audio";
          return permission === "notifications";
        },
      );
      session.defaultSession.setPermissionRequestHandler(
        (webContents, permission, callback, details) => {
          const origin =
            permission === "media"
              ? details.securityOrigin
              : details.requestingUrl;
          const trustedMainFrame =
            webContents === mainWindow?.webContents &&
            details.isMainFrame &&
            isWebRuntimeOrigin(origin);

          if (permission === "media") {
            const audioOnly =
              details.mediaTypes?.length === 1 &&
              details.mediaTypes[0] === "audio";
            if (!trustedMainFrame || !audioOnly) {
              callback(false);
              return;
            }
            if (process.platform === "darwin") {
              void systemPreferences
                .askForMediaAccess("microphone")
                .then(callback, () => callback(false));
              return;
            }
            callback(true);
            return;
          }

          callback(permission === "notifications" && trustedMainFrame);
        },
      );
      await configureRuntimePorts();
      startLocalRuntime();
      try {
        await waitForUrl(`${apiUrl}/health`);
        await waitForUrl(webUrl);
        apiStderr = "";
      } catch (error) {
        const recovered = await recoverDatabaseStartup();
        if (recovered === false) {
          app.quit();
          return;
        }
        if (recovered !== true) throw error;
      }
      runtimeStatus = "ready";
      configureAutoUpdates();
      await createWindow();
      const sendNavigationState = () => {
        if (!mainWindow) return;
        mainWindow.webContents.send("circulo:navigation-state", {
          canGoBack: mainWindow.webContents.navigationHistory.canGoBack(),
          canGoForward: mainWindow.webContents.navigationHistory.canGoForward(),
        });
      };
      mainWindow.webContents.on("did-navigate", sendNavigationState);
      mainWindow.webContents.on("did-navigate-in-page", sendNavigationState);
    } catch (error) {
      runtimeStatus = "error";
      const message = error instanceof Error ? error.message : String(error);
      writeDesktopLog(`startup failed: ${error?.stack || message}`);
      console.error(`[desktop] startup failed: ${message}`);
      stopRuntime();
      dialog.showErrorBox("Circulo could not start", message);
      app.quit();
    }
  });
}

app.on("window-all-closed", () => {
  if (!mainWindow) return;
  stopRuntime();
  if (process.platform !== "darwin") app.quit();
});

let waitingForRuntimeShutdown = false;
app.on("before-quit", (event) => {
  if (waitingForRuntimeShutdown || children.length === 0) {
    stopRuntime();
    return;
  }

  event.preventDefault();
  waitingForRuntimeShutdown = true;
  void stopRuntimeAndWait().finally(() => app.quit());
});
