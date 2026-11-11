/**
 * The editor workspace, laid out per editor-patterns.md:
 * top bar 56 · [rail 56 | inspector 320 | canvas] · transport 56 · timeline.
 */
import { useProject } from "./store/project";
import { useUi, type PanelId, ZOOM_MAX, ZOOM_MIN } from "./store/ui";
import { Icon, IconButton, ToolRail, ToolRailItem, TransportBar, type IconName } from "./components/ui";
import { TopBar } from "./components/workspace/TopBar";
import { ExportDialog } from "./components/workspace/ExportDialog";
import { ContextMenu } from "./components/workspace/ContextMenu";
import { Preview } from "./components/preview/Preview";
import { Timeline } from "./components/timeline/Timeline";
import { MediaPanel } from "./components/inspector/MediaPanel";
import { ClipPanel } from "./components/inspector/ClipPanel";
import { AudioPanel } from "./components/inspector/AudioPanel";
import { TextPanel } from "./components/inspector/TextPanel";
import { CaptionsPanel } from "./components/inspector/CaptionsPanel";
import { MotionPanel } from "./components/motion/MotionPanel";
import { SettingsPanel } from "./components/inspector/SettingsPanel";
import { HelpPanel } from "./components/inspector/HelpPanel";
import { useShortcuts } from "./hooks/useShortcuts";
import { useBootstrap } from "./hooks/useBootstrap";
import { splitAtPlayhead } from "./lib/actions";
import { projectDuration } from "./lib/timeline";
import { spokenTime, timecode } from "./lib/time";

/**
 * The rail holds things you add; selecting something opens its panel
 * (AGENTS.md, UX standards). Emoji and Voice join as their phases land.
 */
const TOOLS: { id: PanelId; icon: IconName; label: string }[] = [
  { id: "media", icon: "media", label: "Media" },
  { id: "clip", icon: "video", label: "Clip" },
  { id: "text", icon: "text", label: "Text" },
  { id: "audio", icon: "audio", label: "Audio" },
  { id: "captions", icon: "captions", label: "Captions" },
  { id: "motion", icon: "motion", label: "Motion" },
];

function Inspector({ panel }: { panel: PanelId }) {
  switch (panel) {
    case "media":
      return <MediaPanel />;
    case "clip":
      return <ClipPanel />;
    case "text":
      return <TextPanel />;
    case "audio":
      return <AudioPanel />;
    case "captions":
      return <CaptionsPanel />;
    case "motion":
      return <MotionPanel />;
    case "settings":
      return <SettingsPanel />;
    case "help":
      return <HelpPanel />;
  }
}

function Transport() {
  const project = useProject((s) => s.project);
  const playing = useUi((s) => s.playing);
  const playhead = useUi((s) => s.playheadMs);
  const zoom = useUi((s) => s.pxPerSecond);
  const volume = useUi((s) => s.previewVolume);
  const speed = useUi((s) => s.speed);
  const ui = useUi.getState();
  const total = projectDuration(project);
  return (
    <TransportBar
      playing={playing}
      current={timecode(playhead, project.settings.fps)}
      total={timecode(total, project.settings.fps)}
      spokenTotal={spokenTime(total)}
      zoom={zoom}
      zoomMin={ZOOM_MIN}
      zoomMax={ZOOM_MAX}
      volume={volume}
      speed={`${speed}x`}
      onPlayPause={() => {
        if (!playing && playhead >= total) ui.setPlayhead(0);
        ui.setPlaying(!playing);
      }}
      onSplit={splitAtPlayhead}
      splitDisabled={Object.keys(project.clips).length === 0 && Object.keys(project.texts).length === 0}
      onStart={() => ui.setPlayhead(0)}
      onEnd={() => ui.setPlayhead(total)}
      onZoom={ui.setZoom}
      onFit={() => window.dispatchEvent(new Event("split:fit-timeline"))}
      onVolume={(v) => ui.set({ previewVolume: v })}
      onSpeed={(s) => ui.set({ speed: parseFloat(s) || 1 })}
    />
  );
}

function NoticeBar() {
  const notice = useUi((s) => s.notice);
  if (!notice) return null;
  const icon = ({ info: "info", success: "check", warning: "warning", danger: "alert" } as const)[notice.tone];
  return (
    <div className={`notice notice--${notice.tone}`} role={notice.tone === "danger" ? "alert" : "status"}>
      <Icon name={icon} size={20} />
      <span className="notice__text">{notice.text}</span>
      <IconButton icon="close" label="Dismiss message" size="sm" onClick={() => useUi.getState().notify(null)} />
    </div>
  );
}

export default function App() {
  useBootstrap();
  useShortcuts();
  const panel = useUi((s) => s.panel);
  const live = useUi((s) => s.liveMessage);

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <nav className="rail-wrap" aria-label="Panels">
          <ToolRail label="Panels">
            {TOOLS.map((t) => (
              <ToolRailItem key={t.id} icon={t.icon} label={t.label} active={panel === t.id} onClick={() => useUi.getState().setPanel(t.id)} />
            ))}
          </ToolRail>
          <div className="rail-bottom">
            <ToolRailItem icon="settings" label="Settings" active={panel === "settings"} onClick={() => useUi.getState().setPanel("settings")} />
            <ToolRailItem icon="help" label="Help and shortcuts" active={panel === "help"} onClick={() => useUi.getState().setPanel("help")} />
          </div>
        </nav>
        <aside className="inspector">
          <Inspector panel={panel} />
        </aside>
        <main className="stage">
          <NoticeBar />
          <Preview />
        </main>
      </div>
      <div className="dock">
        <Transport />
        <Timeline />
      </div>
      <ExportDialog />
      <ContextMenu />
      <div className="sr-only" aria-live="polite" role="status">
        {live}
      </div>
    </div>
  );
}
