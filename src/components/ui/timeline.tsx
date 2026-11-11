/**
 * Timeline parts from the design system: TrackHeader, TrackLane, Clip,
 * TimelineRuler and Playhead. Clip adds a `motion` kind (drawn with the
 * shape tokens until the system gets its own) and a status badge.
 */
import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { IconButton } from "./controls";
import { Icon } from "./Icon";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const pad = (n: number) => String(n).padStart(2, "0");

export interface TrackHeaderProps {
  name: string;
  locked: boolean;
  hidden: boolean;
  onToggleLock: () => void;
  onToggleHidden: () => void;
  /**
   * Adds a "Delete <name>" button. It shows while the header is hovered or
   * holds focus, so at rest the header matches the design system and the name
   * keeps its room; Tab from Hide still reaches it.
   */
  onDelete?: () => void;
  /**
   * Adds a mute toggle (video and audio tracks). The design system has no
   * "volume off" icon, so a muted track's volume icon is struck through by
   * CSS, the same cue as the eye when hidden; state is never colour alone.
   * Like Delete, it is revealed on hover or focus, except while muted.
   */
  muted?: boolean;
  onToggleMuted?: () => void;
  /**
   * Makes the grip a reorder handle: drag it, press Up or Down on it, or
   * press Alt+Up or Alt+Down anywhere in the header (editor-patterns.md).
   */
  onMove?: (dir: -1 | 1) => void;
  onGripPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
}

export function TrackHeader({ name, locked, hidden, onToggleLock, onToggleHidden, onDelete, muted, onToggleMuted, onMove, onGripPointerDown }: TrackHeaderProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onMove || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    const onGrip = (e.target as HTMLElement).classList.contains("track-grip");
    if (!e.altKey && !onGrip) return;
    e.preventDefault();
    e.stopPropagation();
    onMove(e.key === "ArrowUp" ? -1 : 1);
  };
  return (
    <div className="sp-track-head" role="group" aria-label={name} onKeyDown={onKeyDown}>
      {onMove ? (
        <button
          type="button"
          className="sp-ibtn sp-ibtn--sm track-grip"
          aria-label={`Move ${name}. Press Up or Down, or drag.`}
          title="Drag to reorder, or press Alt+Up or Alt+Down"
          style={{ cursor: "grab", touchAction: "none" }}
          onPointerDown={onGripPointerDown}
        >
          <Icon name="grip" size={16} />
        </button>
      ) : (
        <span className="sp-ibtn sp-ibtn--sm" aria-hidden="true" style={{ cursor: "default" }}>
          <Icon name="grip" size={16} />
        </span>
      )}
      <span className="sp-track-head__name" title={name}>
        {name}
      </span>
      {onToggleMuted && (
        <IconButton
          icon="volume"
          label={`${muted ? "Unmute" : "Mute"} ${name}`}
          active={!!muted}
          size="sm"
          iconSize={16}
          className={muted ? "track-mute track-mute--on" : "track-mute"}
          onClick={onToggleMuted}
        />
      )}
      <IconButton icon={locked ? "lock" : "unlock"} label={`${locked ? "Unlock" : "Lock"} ${name}`} active={locked} size="sm" iconSize={16} onClick={onToggleLock} />
      <IconButton icon={hidden ? "eye-off" : "eye"} label={`${hidden ? "Show" : "Hide"} ${name}`} active={hidden} size="sm" iconSize={16} onClick={onToggleHidden} />
      {onDelete && <IconButton icon="trash" label={`Delete ${name}`} size="sm" iconSize={16} className="track-delete" onClick={onDelete} />}
    </div>
  );
}

export function TrackLane({ width, label, children, style, onPointerDown }: { width: number; label: string; children?: ReactNode; style?: CSSProperties; onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div className="sp-lane" style={{ width, ...style }} role="group" aria-label={label} onPointerDown={onPointerDown}>
      {children}
    </div>
  );
}

export type ClipKind = "shape" | "text" | "caption" | "video" | "audio" | "motion";

const KIND: Record<ClipKind, [icon: string, name: string, css: string]> = {
  shape: ["shapes", "Shape", "shape"],
  text: ["text", "Text", "text"],
  caption: ["captions", "Subtitles", "caption"],
  video: ["video", "Video", "video"],
  audio: ["music", "Audio", "audio"],
  motion: ["effects", "Motion", "shape"],
};

export interface ClipProps {
  kind: ClipKind;
  label: string;
  left: number;
  width: number;
  selected?: boolean;
  dimmed?: boolean;
  thumbnails?: string[];
  /** Bar heights 0..1 for the audio waveform. */
  bars?: number[];
  /** Shown with an icon and words, never colour alone. */
  status?: { icon: string; text: string };
  ariaLabel?: string;
  trimmable?: boolean;
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onTrimPointerDown?: (edge: "start" | "end", e: PointerEvent<HTMLSpanElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
  style?: CSSProperties;
}

export function Clip(p: ClipProps) {
  const [icon, name, css] = KIND[p.kind];
  return (
    <button
      type="button"
      className={cx("sp-clip", `sp-clip--${css}`)}
      aria-pressed={!!p.selected}
      aria-label={p.ariaLabel ?? `${name} clip, ${p.label}`}
      style={{ left: p.left, width: Math.max(p.width, 6), opacity: p.dimmed ? "var(--opacity-disabled)" : undefined, touchAction: "none", ...p.style }}
      onPointerDown={p.onPointerDown}
      onKeyDown={p.onKeyDown}
      onClick={p.onClick}
    >
      <Icon name={p.status?.icon ?? icon} size={16} className="sp-clip__icon" />
      {p.kind === "video" ? (
        <span className="sp-clip__thumbs" aria-hidden="true">
          {(p.thumbnails ?? []).map((s, i) => (
            <img key={i} src={s} alt="" draggable={false} />
          ))}
        </span>
      ) : (
        <span className="sp-clip__label">{p.status ? `${p.status.text}: ${p.label}` : p.label}</span>
      )}
      {p.kind === "audio" && p.bars && (
        <svg className="sp-clip__wave" width="100%" height={22} aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 ${p.bars.length * 5} 22`}>
          {p.bars.map((b, i) => {
            const h = 3 + b * 16;
            return <rect key={i} x={i * 5} y={11 - h / 2} width={2.5} height={h} rx={1.25} />;
          })}
        </svg>
      )}
      {p.selected && p.trimmable && (
        <>
          <span className="sp-clip__handle sp-clip__handle--l" aria-hidden="true" style={{ cursor: "ew-resize", width: 8 }} onPointerDown={(e) => p.onTrimPointerDown?.("start", e)} />
          <span className="sp-clip__handle sp-clip__handle--r" aria-hidden="true" style={{ cursor: "ew-resize", width: 8 }} onPointerDown={(e) => p.onTrimPointerDown?.("end", e)} />
        </>
      )}
    </button>
  );
}

const LABEL_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];

function label(s: number): string {
  if (s === 0) return "0s";
  if (s % 60 === 0) return `${s / 60}m`;
  return pad(s % 60);
}

export interface TimelineRulerProps {
  seconds: number;
  pxPerSecond: number;
  timeMs: number;
  valueText: string;
  onSeek: (ms: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

/** Scrubbable ruler. A `slider`: Left/Right ±1 s, Shift ±5 s, Home/End. */
export function TimelineRuler({ seconds, pxPerSecond: px, timeMs, valueText, onSeek, onScrubStart, onScrubEnd }: TimelineRulerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const every = LABEL_STEPS.find((s) => s * px >= 48) ?? 3600;
  const minor = px >= 6 ? 1 : Math.max(1, every / 5);
  const width = Math.ceil(seconds * px) + 1;
  const ticks: ReactNode[] = [];
  for (let s = 0; s <= seconds; s += minor) {
    const major = s % every === 0;
    const x = s * px + 0.5;
    ticks.push(<line key={`l${s}`} x1={x} x2={x} y1={major ? 14 : 20} y2={28} stroke="currentColor" strokeWidth={1} opacity={major ? 0.9 : 0.5} />);
    if (major)
      ticks.push(
        <text key={`t${s}`} x={x + 4} y={11}>
          {label(s)}
        </text>,
      );
  }
  const seekFromEvent = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) onSeek(Math.max(0, ((clientX - r.left) / px) * 1000));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = (e.shiftKey ? 5 : 1) * 1000;
    if (e.key === "ArrowRight") onSeek(timeMs + step);
    else if (e.key === "ArrowLeft") onSeek(Math.max(0, timeMs - step));
    else if (e.key === "Home") onSeek(0);
    else if (e.key === "End") onSeek(seconds * 1000);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div
      ref={ref}
      className="sp-ruler"
      role="slider"
      tabIndex={0}
      aria-label="Timeline position"
      aria-valuemin={0}
      aria-valuemax={Math.round(seconds)}
      aria-valuenow={Math.round(timeMs / 1000)}
      aria-valuetext={valueText}
      style={{ width, touchAction: "none" }}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrubStart?.();
        seekFromEvent(e.clientX);
      }}
      onPointerMove={(e) => e.buttons & 1 && seekFromEvent(e.clientX)}
      onPointerUp={() => onScrubEnd?.()}
    >
      <svg width={width} height={28} aria-hidden="true">
        {ticks}
      </svg>
    </div>
  );
}

export function Playhead({ x }: { x: number }) {
  return (
    <div className="sp-playhead" style={{ left: x }} aria-hidden="true">
      <svg width={14} height={14} viewBox="0 0 14 14" focusable="false">
        <path d="M1 1.5h12v6L7 13 1 7.5z" fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
      </svg>
      <span className="sp-playhead__line" />
    </div>
  );
}
