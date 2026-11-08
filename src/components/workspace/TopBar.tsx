import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, IconButton, Logo, Select } from "../ui";
import { ASPECTS, aspectOf } from "../../lib/actions";
import { createProject } from "../../lib/timeline";
import { exportLottieFiles } from "../../lib/export";
import * as ipc from "../../lib/ipc";
import type { Project } from "../../types/project";

function ProjectMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<ipc.ProjectSummary[]>([]);
  useEffect(() => {
    ipc.projectList().then(setProjects).catch(() => {});
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [onClose]);

  const current = useProject.getState().project.id;
  const openProject = async (id: string) => {
    const p = (await ipc.projectLoad(id)) as Project | null;
    if (p?.version === 1) {
      useProject.getState().load(p);
      const { ensureProxies } = await import("../../lib/actions");
      ensureProxies(p);
    }
    onClose();
  };

  const exportLottie = async () => {
    onClose();
    const dir = await open({ directory: true, title: "Choose a folder for the Lottie files" });
    if (typeof dir !== "string") return;
    try {
      const n = await exportLottieFiles(useProject.getState().project, dir);
      useUi.getState().notify({ tone: "success", text: `Exported ${n} Lottie file${n === 1 ? "" : "s"}.` });
    } catch (e) {
      useUi.getState().notify({ tone: "danger", text: ipc.errorMessage(e) });
    }
  };

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label="Project"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
          const i = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          e.preventDefault();
        }
      }}
    >
      <button
        role="menuitem"
        className="menu__item"
        onClick={() => {
          useProject.getState().load(createProject());
          useUi.getState().select(null);
          useUi.getState().setPlayhead(0);
          onClose();
        }}
      >
        New project
      </button>
      <button role="menuitem" className="menu__item" disabled={Object.keys(useProject.getState().project.motion).length === 0} onClick={() => void exportLottie()}>
        Export Lottie files…
      </button>
      {projects.filter((p) => p.id !== current).length > 0 && <div className="menu__label">Recent projects</div>}
      {projects
        .filter((p) => p.id !== current)
        .slice(0, 8)
        .map((p) => (
          <button key={p.id} role="menuitem" className="menu__item" onClick={() => void openProject(p.id)}>
            {p.name}
          </button>
        ))}
    </div>
  );
}

export function TopBar() {
  const project = useProject((s) => s.project);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const tool = useUi((s) => s.tool);
  const [menu, setMenu] = useState(false);
  const mod = navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Ctrl";

  return (
    <header className="topbar">
      <div className="topbar__group">
        <div style={{ position: "relative" }}>
          <IconButton icon="menu" label="Project menu" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} />
          {menu && <ProjectMenu onClose={() => setMenu(false)} />}
        </div>
        <Logo variant="mark" height={24} />
        <input
          className="project-name"
          aria-label="Project name"
          defaultValue={project.name}
          key={project.id}
          onBlur={(e) => {
            const name = e.target.value.trim() || "Untitled project";
            if (name !== project.name) useProject.getState().commit((p) => ({ ...p, name }));
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className="topbar__group" role="toolbar" aria-label="Edit tools">
        <IconButton icon="select" label="Select tool (V)" active={tool === "select"} onClick={() => useUi.getState().setTool("select")} />
        <IconButton icon="split" label="Blade tool (B)" active={tool === "blade"} onClick={() => useUi.getState().setTool("blade")} />
        <span className="sp-transport__rule" aria-hidden="true" />
        <IconButton icon="undo" label={`Undo (${mod}+Z)`} disabled={!canUndo} onClick={() => useProject.getState().undo()} />
        <IconButton icon="redo" label={`Redo (${mod}+Shift+Z)`} disabled={!canRedo} onClick={() => useProject.getState().redo()} />
      </div>
      <div className="topbar__group">
        <div style={{ width: 168 }}>
          <Select
            label="Canvas aspect ratio"
            value={aspectOf(project)}
            options={ASPECTS.map((a) => ({ value: a.value, label: a.label }))}
            onChange={(v) => {
              const a = ASPECTS.find((x) => x.value === v);
              if (a) useProject.getState().commit((p) => ({ ...p, settings: { ...p.settings, width: a.width, height: a.height } }));
            }}
          />
        </div>
        <Button variant="primary" icon="export" onClick={() => useUi.getState().set({ exportOpen: true })} disabled={Object.keys(project.clips).length === 0}>
          Export
        </Button>
      </div>
    </header>
  );
}
