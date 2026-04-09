import { app, BrowserWindow, protocol, net, shell } from "electron";
import path from "node:path";
import {
  emitWindowStateChanged,
  setupIpcHandlers,
} from "./ipc.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";
import { updateElectronApp, UpdateSourceType } from "update-electron-app";

import { ServiceRegistry } from "@flazz/core/dist/services/service_registry.js";
import { gmailSyncService } from "@flazz/core/dist/knowledge/sync_gmail.js";
import { calendarSyncService } from "@flazz/core/dist/knowledge/sync_calendar.js";
import { firefliesSyncService } from "@flazz/core/dist/knowledge/sync_fireflies.js";
import { granolaSyncService } from "@flazz/core/dist/knowledge/granola/sync.js";
import { graphBuilderService } from "@flazz/core/dist/knowledge/build_graph.js";
import { agentRunnerService } from "@flazz/core/dist/agent-schedule/runner.js";
import { workspaceWatcherService, runsWatcherService, servicesWatcherService } from "./ipc.js";
import { initConfigs } from "@flazz/core/dist/config/initConfigs.js";
import started from "electron-squirrel-startup";

const rendererDevUrl = "http://localhost:4318";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// run this as early in the main process as possible
if (started) app.quit();

// Path resolution differs between development and production:
const preloadPath = app.isPackaged
  ? path.join(__dirname, "../preload/dist/preload.js")
  : path.join(__dirname, "../../../preload/dist/preload.js");
console.log("preloadPath", preloadPath);

const rendererPath = app.isPackaged
  ? path.join(__dirname, "../renderer/dist") // Production
  : path.join(__dirname, "../../../renderer/dist"); // Development
console.log("rendererPath", rendererPath);

const appIconPath = app.isPackaged
  ? path.join(rendererPath, "icon.png")
  : path.join(__dirname, "../../../renderer/public/icon.png");

// Register custom protocol for serving built renderer files in production.
// This keeps SPA routes working when users deep link into the packaged app.
function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);

    // url.pathname starts with "/"
    let urlPath = url.pathname;

    // If it's "/" or a SPA route (no extension), serve index.html
    if (urlPath === "/" || !path.extname(urlPath)) {
      urlPath = "/index.html";
    }

    const filePath = path.join(rendererPath, urlPath);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true,
      // optional but often helpful:
      // stream: true,
    },
  },
]);

function createWindow() {
  const isMac = process.platform === "darwin";
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1280,
    height: 800,
    show: false, // Don't show until ready
    backgroundColor: "#252525", // Prevent white flash (matches dark mode)
    icon: appIconPath,
    webPreferences: {
      // IMPORTANT: keep Node out of renderer
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadPath,
    },
  };

  if (isMac) {
    windowOptions.titleBarStyle = "hiddenInset";
    windowOptions.trafficLightPosition = { x: 12, y: 12 };
  } else {
    windowOptions.frame = false;
    windowOptions.autoHideMenuBar = true;
  }

  const win = new BrowserWindow(windowOptions);

  if (!isMac) {
    win.removeMenu();
  }

  // Show window when content is ready to prevent blank screen
  win.once("ready-to-show", () => {
    win.show();
    emitWindowStateChanged(win);
  });

  win.on("maximize", () => emitWindowStateChanged(win));
  win.on("unmaximize", () => emitWindowStateChanged(win));
  win.on("enter-full-screen", () => emitWindowStateChanged(win));
  win.on("leave-full-screen", () => emitWindowStateChanged(win));

  // Open external links in system browser (not sandboxed Electron window)
  // This handles window.open() and target="_blank" links
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Handle navigation to external URLs (e.g., clicking a link without target="_blank")
  win.webContents.on("will-navigate", (event, url) => {
    const isInternal =
      url.startsWith("app://") || url.startsWith(rendererDevUrl);
    if (!isInternal) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (app.isPackaged) {
    win.loadURL("app://-/index.html");
  } else {
    win.loadURL(rendererDevUrl);
  }
}


const serviceRegistry = new ServiceRegistry();
serviceRegistry.register(workspaceWatcherService);
serviceRegistry.register(runsWatcherService);
serviceRegistry.register(servicesWatcherService);
serviceRegistry.register(gmailSyncService);
serviceRegistry.register(calendarSyncService);
serviceRegistry.register(firefliesSyncService);
serviceRegistry.register(granolaSyncService);
serviceRegistry.register(graphBuilderService);
serviceRegistry.register(agentRunnerService);

app.whenReady().then(async () => {
  // Register custom protocol before creating window (for production builds)
  if (app.isPackaged) {
    registerAppProtocol();
  }

  // Initialize auto-updater (only in production)
  if (app.isPackaged) {
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: "Flazzlabs/Flazz",
      },
      notifyUser: true, // Shows native dialog when update is available
    });
  }

  // Initialize all config files before UI can access them
  await initConfigs();

  setupIpcHandlers();

  createWindow();

  await serviceRegistry.startAll();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  serviceRegistry.stopAll();
});
