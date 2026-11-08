/**
 * Captions: generate a word-level transcript, correct words in place, and
 * style the plain caption plate. Correcting a word keeps its ID and timing,
 * so motion built on it stays in sync.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, Icon, Panel, PanelRow, PanelSection, Select, Slider } from "../ui";
import { useGestureEdit } from "../../hooks/useGestureEdit";
import { editWord, refreshWhisper, transcribe } from "../../lib/actions";
import { cancelJob } from "../../lib/ipc";
import { placedCaptions, segmentWords } from "../../lib/timeline";
import { timecode } from "../../lib/time";

function WordButton({ assetId, id, text }: { assetId: string; id: string; text: string }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        className="word-edit"
        aria-label={`Correct word "${text}"`}
        defaultValue={text}
        autoFocus
        size={Math.max(3, text.length + 1)}
        onBlur={(e) => {
          editWord(assetId, id, e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
          e.stopPropagation();
        }}
      />
    );
  }
  return (
    <button type="button" className="word" onClick={() => setEditing(true)} aria-label={`${text}. Edit word`}>
      {text}
    </button>
  );
}

export function CaptionsPanel() {
  const project = useProject((s) => s.project);
  const selection = useUi((s) => s.selection);
  const transcribing = useUi((s) => s.transcribing);
  const whisper = useUi((s) => s.whisper);
  const model = useUi((s) => s.settings.whisperModel);
  const g = useGestureEdit();
  const listRef = useRef<HTMLDivElement>(null);

  const audioAssets = Object.values(project.assets).filter((a) => a.hasAudio);
  const [assetId, setAssetId] = useState<string | undefined>(undefined);
  const current = assetId && project.assets[assetId] ? assetId : selection?.kind === "segment" ? selection.assetId : audioAssets[0]?.id;
  const tr = current ? project.transcripts[current] : undefined;
  const placed = useMemo(() => new Map(placedCaptions(project).map((c) => [`${c.assetId}/${c.segmentId}`, c])), [project]);

  useEffect(() => {
    void refreshWhisper();
  }, []);

  useEffect(() => {
    if (selection?.kind !== "segment") return;
    listRef.current?.querySelector(`[data-seg="${selection.segmentId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selection]);

  const modelInstalled = whisper?.models.find((m) => m.name === model)?.installed;
  const ready = !!whisper?.binary && !!modelInstalled;

  return (
    <Panel title="Captions">
      <PanelSection>
        {audioAssets.length === 0 ? (
          <p className="hint">Add a clip with speech to generate captions.</p>
        ) : (
          <>
            {audioAssets.length > 1 && (
              <PanelRow label="Media">
                <Select label="Media to caption" value={current ?? ""} options={audioAssets.map((a) => ({ value: a.id, label: a.name }))} onChange={setAssetId} />
              </PanelRow>
            )}
            {whisper && !whisper.binary && (
              <p className="status status--warning">
                <Icon name="warning" size={16} /> whisper.cpp is not installed. See Settings.
              </p>
            )}
            {whisper?.binary && !modelInstalled && (
              <p className="status status--warning">
                <Icon name="warning" size={16} /> The {model} model is not downloaded. See Settings.
              </p>
            )}
            {transcribing ? (
              <div className="button-row">
                <span className="status status--info">
                  <Icon name="info" size={16} /> Generating captions…
                </span>
                <Button variant="ghost" size="sm" onClick={() => void cancelJob(transcribing.jobId)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="secondary" icon="captions" disabled={!current || !ready} onClick={() => current && void transcribe(current)}>
                {tr ? "Regenerate captions" : "Generate captions"}
              </Button>
            )}
            <p className="hint">Runs on this computer with whisper.cpp ({model}). Nothing is uploaded.</p>
          </>
        )}
      </PanelSection>

      <PanelSection>
        <h3 className="section-title">Caption style</h3>
        <PanelRow label="Size">
          <Slider
            label="Caption size"
            min={25}
            max={90}
            value={Math.round(project.captionStyle.size * 1000)}
            valueText={`${(project.captionStyle.size * 100).toFixed(1)} percent of frame height`}
            onChange={(v) => g.change((p) => ({ ...p, captionStyle: { ...p.captionStyle, size: v / 1000 } }))}
            onCommit={g.done}
          />
        </PanelRow>
        <PanelRow label="Position">
          <Slider
            label="Caption vertical position"
            min={10}
            max={95}
            value={Math.round(project.captionStyle.position * 100)}
            valueText={`${Math.round(project.captionStyle.position * 100)} percent from the top`}
            onChange={(v) => g.change((p) => ({ ...p, captionStyle: { ...p.captionStyle, position: v / 100 } }))}
            onCommit={g.done}
          />
        </PanelRow>
        <p className="hint">Segments with motion show their motion instead of this plate.</p>
      </PanelSection>

      {tr && current && (
        <PanelSection className="panel-scroll">
          <h3 className="section-title">
            Transcript · {tr.words.length} words
          </h3>
          <p className="hint">Select a word to correct it. Its timing stays the same.</p>
          <div ref={listRef} className="segments">
            {tr.segments.map((seg) => {
              const pc = placed.get(`${current}/${seg.id}`);
              const selected = selection?.kind === "segment" && selection.segmentId === seg.id && selection.assetId === current;
              return (
                <div key={seg.id} data-seg={seg.id} className={`segment${selected ? " segment--selected" : ""}`}>
                  <button
                    type="button"
                    className="segment__time"
                    disabled={!pc}
                    onClick={() => {
                      if (!pc) return;
                      useUi.getState().setPlayhead(pc.startMs);
                      useUi.getState().select({ kind: "segment", assetId: current, segmentId: seg.id });
                    }}
                    aria-label={pc ? `Go to ${timecode(pc.startMs, project.settings.fps)}` : "Not in the edit"}
                  >
                    {pc ? timecode(pc.startMs, project.settings.fps) : "Cut"}
                  </button>
                  <span className="segment__words">
                    {segmentWords(tr, seg).map((w) => (
                      <WordButton key={w.id} assetId={current} id={w.id} text={w.text} />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </PanelSection>
      )}
    </Panel>
  );
}
