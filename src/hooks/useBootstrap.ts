/**
 * App start-up and background wiring: load the last project, listen for Rust
 * events, accept dropped files, apply the theme, and autosave.
 */
import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useProject } from "../store/project";
import { useUi } from "../store/ui";
import * as ipc from "../lib/ipc";
import { ensureProxies, handleMediaJob, importPaths, refreshWhisper } from "../lib/actions";
import type { Project } from "../types/project";

const AUTOSAVE_MS = 800;

function isProject(v: unknown): v is Project {
  return !!v && typeof v === "object" && (v as Project).version === 1 && typeof (v as Project).id === "string";
}

export function useBootstrap() {
  const theme = useUi((s) => s.settings.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!ipc.inTauri) return;
    const unlisten: Promise<() => void>[] = [];
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let ready = false;

    (async () => {
      try {
        const last = await ipc.projectLoadLast();
        if (isProject(last)) {
          useProject.getState().load(last);
          ensureProxies(last);
        }
      } catch (e) {
        useUi.getState().notify({ tone: "warning", text: `Could not reopen your last project. ${ipc.errorMessage(e)}` });
      }
      ready = true;
      ipc.claudeKeyStatus().then((s) => useUi.getState().set({ keyStatus: s })).catch(() => {});
      void refreshWhisper();
    })();

    unlisten.push(ipc.onMediaJob(handleMediaJob));
    unlisten.push(
      ipc.onMotionProgress((e) => {
        const m = useUi.getState().motion;
        if (m && m.requestId === e.requestId) useUi.getState().set({ motion: { ...m, progress: e } });
      }),
    );
    unlisten.push(
      ipc.onModelDownload((e) => {
        const d = useUi.getState().downloads;
        if (e.name in d) useUi.getState().set({ downloads: { ...d, [e.name]: e.progress } });
      }),
    );
    unlisten.push(
      getCurrentWebview().onDragDropEvent((ev) => {
        if (ev.payload.type === "drop" && ev.payload.paths.length) void importPaths(ev.payload.paths);
      }),
    );

    const unsub = useProject.subscribe((s, prev) => {
      if (!ready || s.revision === prev.revision || s.gestureStart) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        ipc.projectSave(useProject.getState().project).catch((e) => useUi.getState().notify({ tone: "danger", text: `Could not save the project. ${ipc.errorMessage(e)}` }));
      }, AUTOSAVE_MS);
    });

    return () => {
      unsub();
      clearTimeout(saveTimer);
      unlisten.forEach((u) => void u.then((f) => f()));
    };
  }, []);
}
