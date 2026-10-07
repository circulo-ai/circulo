const { contextBridge, ipcRenderer } = require("electron");

function createIcon(pathData) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.className = "circulo-desktop-toolbar-icon";
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  svg.appendChild(path);
  return svg;
}

function installDesktopToolbar() {
  if (document.getElementById("circulo-desktop-toolbar")) return;

  const toolbar = document.createElement("div");
  toolbar.id = "circulo-desktop-toolbar";
  toolbar.innerHTML = `
    <div class="circulo-desktop-toolbar-brand">Circulo</div>
    <div class="circulo-desktop-toolbar-actions">
      <button type="button" data-circulo-navigation="back" aria-label="Go back" title="Go back"></button>
      <button type="button" data-circulo-navigation="forward" aria-label="Go forward" title="Go forward"></button>
    </div>
  `;

  const back = toolbar.querySelector('[data-circulo-navigation="back"]');
  const forward = toolbar.querySelector('[data-circulo-navigation="forward"]');
  back.appendChild(createIcon("M15 18l-6-6 6-6"));
  forward.appendChild(createIcon("M9 18l6-6-6-6"));
  back.addEventListener("click", () =>
    ipcRenderer.send("circulo:navigate-back"),
  );
  forward.addEventListener("click", () =>
    ipcRenderer.send("circulo:navigate-forward"),
  );

  const style = document.createElement("style");
  style.textContent = `
    :root { --circulo-desktop-toolbar-height: 40px; }
    body { margin: 0 !important; }
    #circulo-desktop-toolbar {
      align-items: center;
      background: #18181b;
      color: #a1a1aa;
      display: flex;
      height: var(--circulo-desktop-toolbar-height);
      flex: 0 0 var(--circulo-desktop-toolbar-height);
      justify-content: flex-start;
      position: relative;
      user-select: none;
      z-index: 2147483647;
      -webkit-app-region: drag;
      -webkit-user-select: none;
    }
    .circulo-desktop-toolbar-brand {
      color: #e4e4e7;
      font: 600 13px/1 system-ui, sans-serif;
      letter-spacing: -0.01em;
      margin: 0 16px 0 14px;
    }
    .circulo-desktop-toolbar-actions { display: flex; gap: 2px; }
    .circulo-desktop-toolbar-actions button {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: #a1a1aa;
      display: inline-flex;
      height: 28px;
      justify-content: center;
      padding: 0;
      width: 30px;
      -webkit-app-region: no-drag;
    }
    .circulo-desktop-toolbar-actions button:hover:not(:disabled) { background: #27272a; color: #f4f4f5; }
    .circulo-desktop-toolbar-actions button:focus-visible { outline: 2px solid #71717a; outline-offset: -2px; }
    .circulo-desktop-toolbar-actions button:disabled { color: #52525b; cursor: default; }
    .circulo-desktop-toolbar-icon { height: 17px; width: 17px; }
  `;
  document.head.appendChild(style);
  // Insert before the app root so the page layout starts below the toolbar;
  // a fixed overlay would obscure full-height workspace surfaces.
  document.body.insertBefore(toolbar, document.body.firstChild);

  const update = ({ canGoBack, canGoForward }) => {
    back.disabled = !canGoBack;
    forward.disabled = !canGoForward;
  };
  ipcRenderer.on("circulo:navigation-state", (_event, state) => update(state));
  ipcRenderer
    .invoke("circulo:navigation-state")
    .then(update)
    .catch(() => {});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installDesktopToolbar, {
    once: true,
  });
} else {
  installDesktopToolbar();
}

contextBridge.exposeInMainWorld("circuloDesktop", {
  runtimeInfo: () => ipcRenderer.invoke("circulo:runtime-info"),
  onRuntimeStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("circulo:runtime-status", handler);
    return () => ipcRenderer.removeListener("circulo:runtime-status", handler);
  },
  onUpdateStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("circulo:update-status", handler);
    return () => ipcRenderer.removeListener("circulo:update-status", handler);
  },
  downloadUpdate: () => ipcRenderer.invoke("circulo:download-update"),
  installUpdate: () => ipcRenderer.invoke("circulo:install-update"),
  isDesktop: true,
});
