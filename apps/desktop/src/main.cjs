const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
} = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

// Electron itself may be launched from development shells that set Node-only
// flags. Packaged Electron does not support all NODE_OPTIONS values, and
// forwarding them to the embedded Node runtime can prevent the local API from
// starting. Keep the desktop runtime isolated from those shell settings.
delete process.env.NODE_OPTIONS;

const API_PORT = Number(process.env.CIRCULO_DESKTOP_API_PORT || 3322);
const WEB_PORT = Number(process.env.CIRCULO_DESKTOP_WEB_PORT || 3310);
const apiUrl = `http://127.0.0.1:${API_PORT}`;
const webUrl =
  process.env.CIRCULO_DESKTOP_WEB_URL || `http://127.0.0.1:${WEB_PORT}`;
const children = [];
let mainWindow;
let runtimeStatus = "starting";
let updateStatus = "idle";
let autoUpdater;

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

function workspaceRoot() {
  return (
    process.env.CIRCULO_DESKTOP_REPO ||
    (app.isPackaged
      ? path.join(process.resourcesPath, "runtime")
      : path.resolve(__dirname, "../../.."))
  );
}

function secretStorePath() {
  return path.join(app.getPath("userData"), "secrets.json");
}

function loadSecrets() {
  const file = secretStorePath();
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // First launch.
  }

  const values = {};
  for (const name of [
    "BETTER_AUTH_SECRET",
    "ENCRYPTION_KEY",
    "INTERNAL_API_SECRET",
  ]) {
    if (stored[name] && safeStorage.isEncryptionAvailable()) {
      try {
        values[name] = safeStorage.decryptString(
          Buffer.from(stored[name], "base64"),
        );
        continue;
      } catch (error) {
        console.warn(`[desktop] resetting unreadable ${name}:`, error.message);
        delete stored[name];
      }
    }
    values[name] = crypto.randomBytes(32).toString("hex");
    if (safeStorage.isEncryptionAvailable()) {
      stored[name] = safeStorage.encryptString(values[name]).toString("base64");
    }
  }

  if (safeStorage.isEncryptionAvailable()) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(stored), { mode: 0o600 });
  }
  return values;
}

function spawnProcess(command, args, env, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "pipe",
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => {
    const output = String(chunk);
    process.stdout.write(`[desktop:${command}] ${output}`);
    writeDesktopLog(`[${command}:stdout] ${output.trimEnd()}`);
  });
  child.stderr.on("data", (chunk) => {
    const output = String(chunk);
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
  child.on("exit", (code) => {
    console.log(`[desktop:${command}] exited with code ${code ?? "null"}`);
    if (code && runtimeStatus !== "stopping") {
      runtimeStatus = "error";
      writeDesktopLog(`[${command}] exited with code ${code}`);
      if (mainWindow)
        mainWindow.webContents.send("circulo:runtime-status", runtimeStatus);
    }
  });
  children.push(child);
  return child;
}

function startLocalRuntime() {
  const root = workspaceRoot();
  const bun = process.env.CIRCULO_DESKTOP_BUN || "bun";
  const secrets = loadSecrets();
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
    NEXT_PUBLIC_CIRCULO_RUNTIME_KIND: "desktop",
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
      );
    } else {
      spawnProcess(
        bun,
        [
          "--cwd",
          path.join(root, "apps/web"),
          "dev",
          "--",
          "-p",
          String(WEB_PORT),
        ],
        {
          ...common,
          PORT: String(WEB_PORT),
          SERVER_API_URL: apiUrl,
          NEXT_PUBLIC_BETTER_AUTH_URL: apiUrl,
        },
        root,
      );
    }
  }
}

function configureAutoUpdates() {
  if (!app.isPackaged) return;
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
    if (process.env.CIRCULO_UPDATE_URL) {
      autoUpdater.setFeedURL({
        provider: "generic",
        url: process.env.CIRCULO_UPDATE_URL,
      });
    }
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
      if (response.ok || response.status < 500) return;
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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) return { action: "allow" };
    return { action: "deny" };
  });
  return mainWindow.loadURL(webUrl);
}

function stopRuntime() {
  runtimeStatus = "stopping";
  for (const child of children) child.kill();
}

ipcMain.handle("circulo:runtime-info", () => ({
  apiUrl,
  webUrl,
  dataPath: path.join(app.getPath("userData"), "data"),
  status: runtimeStatus,
  updateStatus,
}));
ipcMain.handle("circulo:navigation-state", () => ({
  canGoBack: Boolean(mainWindow?.webContents.canGoBack()),
  canGoForward: Boolean(mainWindow?.webContents.canGoForward()),
}));
ipcMain.on("circulo:navigate-back", () => {
  if (mainWindow?.webContents.canGoBack()) mainWindow.webContents.goBack();
});
ipcMain.on("circulo:navigate-forward", () => {
  if (mainWindow?.webContents.canGoForward())
    mainWindow.webContents.goForward();
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
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, permission, callback) => {
          callback(["notifications", "media"].includes(permission));
        },
      );
      startLocalRuntime();
      await waitForUrl(`${apiUrl}/health`);
      await waitForUrl(webUrl);
      runtimeStatus = "ready";
      configureAutoUpdates();
      await createWindow();
      const sendNavigationState = () => {
        if (!mainWindow) return;
        mainWindow.webContents.send("circulo:navigation-state", {
          canGoBack: mainWindow.webContents.canGoBack(),
          canGoForward: mainWindow.webContents.canGoForward(),
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

app.on("before-quit", stopRuntime);
