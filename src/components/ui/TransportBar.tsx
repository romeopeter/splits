import { Button, IconButton, Select, Slider } from "./controls";
import { Icon } from "./Icon";

export interface TransportBarProps {
  playing: boolean;
  current: string;
  total: string;
  spokenTotal: string;
  zoom: number;
  zoomMin: number;
  zoomMax: number;
  volume: number;
  speed: string;
  onPlayPause: () => void;
  onSplit: () => void;
  splitDisabled?: boolean;
  onStart: () => void;
  onEnd: () => void;
  onZoom: (px: number) => void;
  onFit: () => void;
  onVolume: (v: number) => void;
  onSpeed: (s: string) => void;
}

/** The control strip between canvas and timeline (design-system TransportBar, wired up). */
export function TransportBar(p: TransportBarProps) {
  // Zoom slider is logarithmic so the useful range is evenly spread.
  const toSlider = (px: number) => (Math.log(px / p.zoomMin) / Math.log(p.zoomMax / p.zoomMin)) * 100;
  const fromSlider = (v: number) => p.zoomMin * Math.pow(p.zoomMax / p.zoomMin, v / 100);
  return (
    <div className="sp-transport" role="toolbar" aria-label="Playback and timeline">
      <div className="sp-transport__l">
        <span className="sp-transport__muted" style={{ font: "500 13px/18px var(--font-sans)" }} aria-hidden="true">
          Playback speed
        </span>
        <div style={{ width: 84 }}>
          <Select label="Playback speed" value={p.speed} options={["0.5x", "1x", "1.5x", "2x"]} onChange={p.onSpeed} />
        </div>
        <Button variant="secondary" size="sm" icon="split" onClick={p.onSplit} disabled={p.splitDisabled}>
          Split
        </Button>
      </div>
      <div className="sp-transport__c">
        <IconButton icon="skip-back" label="Jump to start" onClick={p.onStart} />
        <IconButton icon={p.playing ? "pause" : "play"} label={p.playing ? "Pause" : "Play"} size="lg" onClick={p.onPlayPause} />
        <span className="sp-timecode" role="timer" aria-label={`Current time ${p.current} of ${p.spokenTotal}`}>
          {p.current}
          <span className="sp-timecode__total"> / {p.total}</span>
        </span>
        <IconButton icon="skip-forward" label="Jump to end" onClick={p.onEnd} />
      </div>
      <div className="sp-transport__r">
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-8)", color: "var(--text-secondary)" }}>
          <Icon name="volume" size={20} />
          <span style={{ width: 72 }}>
            <Slider label="Preview volume" min={0} max={100} value={Math.round(p.volume * 100)} valueText={`${Math.round(p.volume * 100)} percent`} onChange={(v) => p.onVolume(v / 100)} />
          </span>
          <span className="sp-timecode" style={{ minWidth: 36, color: "var(--text-secondary)" }} aria-hidden="true">
            {Math.round(p.volume * 100)}%
          </span>
        </span>
        <span className="sp-transport__rule" aria-hidden="true" />
        <IconButton icon="minus" label="Zoom out timeline" size="sm" onClick={() => p.onZoom(p.zoom / 1.4)} />
        <span className="sp-transport__zoom">
          <Slider label="Timeline zoom" min={0} max={100} step={0.5} value={toSlider(p.zoom)} valueText={`${p.zoom.toFixed(1)} pixels per second`} onChange={(v) => p.onZoom(fromSlider(v))} />
        </span>
        <IconButton icon="plus" label="Zoom in timeline" size="sm" onClick={() => p.onZoom(p.zoom * 1.4)} />
        <Button variant="ghost" size="sm" onClick={p.onFit}>
          Fit timeline
        </Button>
      </div>
    </div>
  );
}
