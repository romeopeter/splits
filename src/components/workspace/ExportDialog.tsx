import { useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, Icon, SegmentedControl } from "../ui";
import { cancelExport, exportLottieFiles, runExport, type ExportTarget } from "../../lib/export";
import { errorMessage } from "../../lib/ipc";
import { projectDuration } from "../../lib/timeline";
import { timecode } from "../../lib/time";

const TARGETS = [
  { value: "mp4", text: "Video", label: "Video: one MP4 with motion and captions" },
  { value: "motion_mov", text: "Motion only", label: "Motion only: transparent ProRes 4444 MOV" },
  { value: "lottie", text: "Lottie", label: "Lottie: one JSON file per motion clip" },
];

const DESCRIPTIONS: Record<ExportTarget, string> = {
  mp4: "One MP4 (H.264 and AAC) at full quality, rendered from your original files with captions and motion included.",
  motion_mov: "The captions and motion layer alone, as a transparent ProRes 4444 .mov, for finishing in another editor.",
  lottie: "Each motion clip as a Lottie .json file, for reuse in other tools.",
};

export function ExportDialog() {
  const openState = useUi((s) => s.exportOpen);
  const state = useUi((s) => s.exportState);
  const project = useProject((s) => s.project);
  const [target, setTarget] = useState<ExportTarget>("mp4");
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const busy = state?.phase === "frames" || state?.phase === "encoding";

  useEffect(() => {
    if (openState) ref.current?.querySelector<HTMLElement>("[role=radio][aria-checked=true]")?.focus();
  }, [openState]);

  if (!openState) return null;
  const close = () => {
    if (busy) return;
    useUi.getState().set({ exportOpen: false, exportState: null });
    setMsg(null);
  };

  const start = async () => {
    setMsg(null);
    if (target === "lottie") {
      const dir = await open({ directory: true, title: "Choose a folder for the Lottie files" });
      if (typeof dir !== "string") return;
      try {
        const n = await exportLottieFiles(project, dir);
        setMsg(`Exported ${n} Lottie file${n === 1 ? "" : "s"} to ${dir}.`);
      } catch (e) {
        setMsg(errorMessage(e));
      }
      return;
    }
    const ext = target === "mp4" ? "mp4" : "mov";
    const path = await save({
      title: "Export",
      defaultPath: `${project.name.replace(/[\\/:*?"<>|]/g, "-")}${target === "motion_mov" ? " motion" : ""}.${ext}`,
      filters: [{ name: target === "mp4" ? "MP4 video" : "QuickTime movie", extensions: [ext] }],
    });
    if (!path) return;
    await runExport(project, target, path);
  };

  const pct = Math.round((state?.progress ?? 0) * 100);
  const motionCount = Object.keys(project.motion).length;

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "Tab") {
            const f = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex='0']") ?? []);
            const first = f[0];
            const last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              last?.focus();
              e.preventDefault();
            } else if (!e.shiftKey && document.activeElement === last) {
              first?.focus();
              e.preventDefault();
            }
          }
          e.stopPropagation();
        }}
      >
        <h2 id="export-title" className="dialog__title">
          Export
        </h2>
        <p className="hint">
          {project.settings.width}×{project.settings.height} · {timecode(projectDuration(project), project.settings.fps)}
        </p>
        <SegmentedControl label="Export format" value={target} onChange={(v) => setTarget(v as ExportTarget)} options={TARGETS} />
        <p className="hint">{DESCRIPTIONS[target]}</p>
        {target === "lottie" && motionCount === 0 && <p className="status status--warning"><Icon name="warning" size={16} /> There are no motion clips yet.</p>}

        {state && (
          <div className="stack-8" role="status" aria-live="polite">
            {busy && (
              <>
                <div className="progress" aria-hidden="true">
                  <div className="progress__fill" style={{ width: `${pct}%` }} />
                </div>
                <p className="hint">
                  {state.phase === "frames" ? "Rendering captions and motion" : "Encoding video"} · {pct}%
                </p>
              </>
            )}
            {state.phase === "done" && (
              <p className="status status--success">
                <Icon name="check" size={16} /> Export finished. Saved to {state.outputPath}
              </p>
            )}
            {state.phase === "failed" && (
              <p className="status status--danger">
                <Icon name="alert" size={16} /> Export failed. {state.error}
              </p>
            )}
            {state.phase === "cancelled" && (
              <p className="status status--warning">
                <Icon name="warning" size={16} /> Export cancelled.
              </p>
            )}
          </div>
        )}
        {msg && <p className="status status--info"><Icon name="info" size={16} /> {msg}</p>}

        <div className="dialog__actions">
          {busy ? (
            <Button variant="secondary" onClick={cancelExport}>
              Cancel export
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
              <Button variant="primary" icon="export" onClick={() => void start()} disabled={target === "lottie" && motionCount === 0}>
                {target === "lottie" ? "Choose folder" : "Choose location"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
