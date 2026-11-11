/**
 * @file main.mjs
 * @brief Own one sandboxed native HMI window, bundled C++ child and private OS-local workspace.
 * @details Jason Stys; lifecycle and important variables are indexed in docs/generated/symbol-index.md.
 */
import { app, BrowserWindow, Menu, dialog, session, shell } from "electron";
import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const test = process.env.TWIN_DESKTOP_TEST === "1";
if (test && process.env.TWIN_DESKTOP_PROFILE) {
  if (!isAbsolute(process.env.TWIN_DESKTOP_PROFILE)) app.exit(2);
  else app.setPath("userData", process.env.TWIN_DESKTOP_PROFILE);
}
let window, runtime;
let closing = false;
let allowedQuit = false;

/** Close only the owned simulated service/engine and leave saved review data intact. */
async function stop() {
  if (closing) return;
  closing = true;
  try {
    await runtime?.close();
    for (const name of ["desktop-ready.json"]) {
      try {
        unlinkSync(join(app.getPath("userData"), name));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    allowedQuit = true;
    app.quit();
  } catch {
    closing = false;
    if (!test)
      dialog.showErrorBox(
        "Workspace could not close",
        "Saved review files were preserved. Use Quit again or review the application guide.",
      );
  }
}

if (!app.requestSingleInstanceLock()) {
  app.exit(2);
} else {
  app.on("before-quit", (event) => {
    if (!allowedQuit) {
      event.preventDefault();
      void stop();
    }
  });
  app.on("window-all-closed", () => {
    void stop();
  });
  app
    .whenReady()
    .then(async () => {
      const resources = app.isPackaged ? process.resourcesPath : join(__dirname, "..");
      const source = JSON.parse(readFileSync(join(resources, "SOURCE.json"), "utf8"));
      if (
        source.version !== app.getVersion() ||
        !/^[a-f0-9]{40}$/u.test(source.source) ||
        typeof source.sourceDirty !== "boolean"
      )
        throw new Error("Package provenance mismatch");
      const { startNative } = await import(
        pathToFileURL(join(__dirname, "dist/desktop/src/runtime.js")).href
      );
      runtime = await startNative({
        profile: app.getPath("userData"),
        enginePath: join(resources, "kernel/twin-engine.exe"),
        staticRoot: join(resources, "ui"),
        version: app.getVersion(),
        source: source.source,
        sourceDirty: source.sourceDirty,
        stop: () => {
          void stop();
        },
      });
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        if (new URL(details.url).origin === runtime.origin) {
          details.requestHeaders["X-Twin-Session"] = runtime.token;
          if (new URL(details.url).pathname === "/api/v1/commands")
            details.requestHeaders.Authorization = "Bearer " + runtime.commandToken;
        }
        callback({ requestHeaders: details.requestHeaders });
      });
      session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
        callback({
          cancel: /^https?:/u.test(details.url) && new URL(details.url).origin !== runtime.origin,
        }),
      );
      session.defaultSession.on("will-download", (_event, item) => {
        if (test) {
          const destination = join(app.getPath("userData"), "test-downloads");
          mkdirSync(destination, { recursive: true });
          item.setSavePath(join(destination, "heated-tank-recording.json"));
        }
      });
      window = new BrowserWindow({
        width: 1400,
        height: 1000,
        minWidth: 850,
        minHeight: 600,
        show: false,
        title: "Industrial Edge Digital Twin — Jason Stys",
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          devTools: !app.isPackaged,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, target) => {
        if (new URL(target).origin !== runtime.origin) {
          event.preventDefault();
          if (
            [
              "https://github.com/JasonStys",
              "https://www.linkedin.com/in/jason-stys-31b30b351/",
            ].includes(target)
          )
            void shell.openExternal(target).catch(() => {
              if (!test)
                dialog.showErrorBox(
                  "Contact link unavailable",
                  "Open github.com/JasonStys in your browser to contact the author.",
                );
            });
        }
      });
      window.on("close", (event) => {
        if (!allowedQuit) {
          event.preventDefault();
          void stop();
        }
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Application",
            submenu: [
              {
                label: "First-use help",
                click: () => {
                  dialog.showMessageBox(window, {
                    type: "info",
                    title: "Local simulation workspace",
                    message:
                      "Use the full HMI to change targets, inject simulated faults and record/read traces. Save targets explicitly; each new launch starts stopped. Saved traces are review-only. No MQTT/device connection is enabled. Quit from this menu to close the simulated engine.",
                    detail: "Created by Jason Stys · github.com/JasonStys",
                  });
                },
              },
              {
                label: "Quit application",
                click: () => {
                  void stop();
                },
              },
            ],
          },
        ]),
      );
      await window.loadURL(runtime.origin + "/#native");
      window.show();
      const ready = {
        schema: 1,
        version: app.getVersion(),
        source: source.source,
        sourceDirty: source.sourceDirty,
        instance: runtime.instance,
        origin: runtime.origin,
        nativeWindowVisible: window.isVisible(),
      };
      if (test) ready.testSession = runtime.token;
      const path = join(app.getPath("userData"), "desktop-ready.json");
      writeFileSync(path + ".new", JSON.stringify(ready), { mode: 0o600 });
      renameSync(path + ".new", path);
    })
    .catch(async () => {
      if (!test)
        dialog.showErrorBox(
          "Application could not start",
          "Existing targets and recordings were preserved. Close another copy or review the application guide.",
        );
      await runtime?.close();
      allowedQuit = true;
      app.exit(2);
    });
}
