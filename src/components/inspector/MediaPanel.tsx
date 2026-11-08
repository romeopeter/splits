import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, Icon, Panel, PanelSection } from "../ui";
import { chooseAndImport, transcribe } from "../../lib/actions";
import { addClip, firstTrackOfKind } from "../../lib/timeline";
import { timecode } from "../../lib/time";
import type { Asset } from "../../types/project";

function Status({ a }: { a: Asset }) {
  if (a.proxy.status === "ready")
    return (
      <span className="status status--success">
        <Icon name="check" size={16} /> Ready
      </span>
    );
  if (a.proxy.status === "failed")
    return (
      <span className="status status--danger" title={a.proxy.error}>
        <Icon name="alert" size={16} /> Not ready
      </span>
    );
  return (
    <span className="status status--info">
      <Icon name="info" size={16} /> Preparing {Math.round(a.proxy.progress * 100)}%
    </span>
  );
}

export function MediaPanel() {
  const project = useProject((s) => s.project);
  const transcribing = useUi((s) => s.transcribing);
  const assets = Object.values(project.assets);

  const addToTimeline = (a: Asset) =>
    useProject.getState().commit((p) => {
      const t = firstTrackOfKind(p, a.hasVideo ? "video" : "audio");
      return t ? addClip(p, a, t.id).project : p;
    });

  return (
    <Panel title="Media">
      <PanelSection>
        <Button variant="secondary" icon="add" onClick={() => void chooseAndImport()}>
          Add media
        </Button>
        <p className="hint">Or drop video and audio files anywhere on the window. Splits makes a light editing copy; your originals are never changed.</p>
      </PanelSection>
      <PanelSection>
        {assets.length === 0 ? (
          <p className="hint">No media yet.</p>
        ) : (
          <ul className="asset-list" aria-label="Media in this project">
            {assets.map((a) => (
              <li key={a.id} className="asset">
                <div className="asset__head">
                  <Icon name={a.hasVideo ? "video" : "music"} size={16} />
                  <span className="asset__name" title={a.path}>
                    {a.name}
                  </span>
                </div>
                <div className="asset__meta">
                  <span className="timecode-sm">{timecode(a.durationMs, project.settings.fps)}</span>
                  {a.width && a.height && (
                    <span>
                      {a.width}×{a.height}
                    </span>
                  )}
                  <Status a={a} />
                </div>
                <div className="asset__actions">
                  <Button variant="ghost" size="sm" icon="plus" onClick={() => addToTimeline(a)}>
                    Add to timeline
                  </Button>
                  {a.hasAudio && (
                    <Button variant="ghost" size="sm" icon="captions" disabled={!!transcribing} onClick={() => void transcribe(a.id)}>
                      {project.transcripts[a.id] ? "Redo captions" : "Generate captions"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
    </Panel>
  );
}
