/**
 * Motion: turn caption segments into Lottie animations with Claude.
 *
 * Shows what leaves the machine before the first generation, lets the
 * person pick which segments to animate and describe a style, reports
 * progress and token usage, and manages individual motion clips
 * (sync status, nudge, hide, regenerate, delete).
 */
import { useMemo, useState } from "react";
import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, Field, Icon, Panel, PanelRow, PanelSection, SegmentedControl, Select } from "../ui";
import { cancelMotion, deleteSelection, generateMotion, type SegmentRef } from "../../lib/actions";
import { placeMotion, placedCaptions } from "../../lib/timeline";
import { timecode } from "../../lib/time";

type Scope = "missing" | "all" | "selected";

export function MotionPanel() {
  const project = useProject((s) => s.project);
  const selection = useUi((s) => s.selection);
  const keyStatus = useUi((s) => s.keyStatus);
  const running = useUi((s) => s.motion);
  const usage = useUi((s) => s.lastUsage);
  const settings = useUi((s) => s.settings);
  const [prompt, setPrompt] = useState(project.motionStyles[0] ?? "");
  const [scope, setScope] = useState<Scope>("missing");

  const captions = useMemo(() => placedCaptions(project), [project]);
  const motions = Object.values(project.motion);
  const placements = useMemo(() => new Map(motions.map((m) => [m.id, placeMotion(project, m)])), [project, motions]);
  const outOfSync = motions.filter((m) => placements.get(m.id)?.status === "out_of_sync");
  const withMotion = new Set(motions.map((m) => `${m.assetId}/${m.segmentId}`));

  const targets: SegmentRef[] = (() => {
    if (scope === "selected") {
      if (selection?.kind === "segment") return [{ assetId: selection.assetId, segmentId: selection.segmentId }];
      if (selection?.kind === "motion") {
        const m = project.motion[selection.id];
        return m ? [{ assetId: m.assetId, segmentId: m.segmentId }] : [];
      }
      return [];
    }
    return captions
      .filter((c) => scope === "all" || !withMotion.has(`${c.assetId}/${c.segmentId}`))
      .map((c) => ({ assetId: c.assetId, segmentId: c.segmentId }));
  })();

  const selected = selection?.kind === "motion" ? project.motion[selection.id] : undefined;
  const selPlacement = selected ? placements.get(selected.id) : undefined;
  const commit = useProject.getState().commit;
  const patchSelected = (patch: Partial<NonNullable<typeof selected>>) =>
    selected && commit((p) => ({ ...p, motion: { ...p.motion, [selected.id]: { ...selected, ...patch } } }));

  if (!keyStatus?.connected) {
    return (
      <Panel title="Motion">
        <PanelSection>
          <p className="panel-lead">Animate your captions from a style you describe.</p>
          <p className="hint">Motion uses Claude with your own Anthropic API key. Connect it in Settings to start. Everything else in Split works offline.</p>
          <Button variant="secondary" icon="settings" onClick={() => useUi.getState().setPanel("settings")}>
            Open settings
          </Button>
        </PanelSection>
      </Panel>
    );
  }

  if (captions.length === 0) {
    return (
      <Panel title="Motion">
        <PanelSection>
          <p className="hint">Motion is built from your captions. Generate captions first, in the Captions panel.</p>
          <Button variant="secondary" icon="captions" onClick={() => useUi.getState().setPanel("captions")}>
            Open captions
          </Button>
        </PanelSection>
      </Panel>
    );
  }

  return (
    <Panel title="Motion">
      {!settings.motionNoticeSeen && (
        <PanelSection>
          <p className="status status--info">
            <Icon name="info" size={16} /> What is sent
          </p>
          <p className="hint">
            For each segment, Split sends Claude the transcript words, their timings, the canvas size and frame rate, and your style prompt. Never your video, audio or file names.
          </p>
          <Button variant="ghost" size="sm" onClick={() => useUi.getState().updateSettings({ motionNoticeSeen: true })}>
            Got it
          </Button>
        </PanelSection>
      )}

      <PanelSection>
        <PanelRow label="Style">
          <Field label="Style prompt" multiline rows={3} value={prompt} placeholder="Bold pop-in words, numbers highlighted in yellow" onChange={setPrompt} />
        </PanelRow>
        {project.motionStyles.length > 0 && (
          <PanelRow label="Saved">
            <Select label="Saved styles" value="" options={[{ value: "", label: "Use a saved style…" }, ...project.motionStyles.map((s) => ({ value: s, label: s.length > 40 ? `${s.slice(0, 40)}…` : s }))]} onChange={(v) => v && setPrompt(v)} />
          </PanelRow>
        )}
        <PanelRow label="Animate">
          <SegmentedControl
            label="Segments to animate"
            value={scope}
            onChange={(v) => setScope(v as Scope)}
            options={[
              { value: "missing", text: "New", label: "Segments without motion" },
              { value: "all", text: "All", label: "All segments in the edit" },
              { value: "selected", text: "Selected", label: "The selected segment" },
            ]}
          />
        </PanelRow>
        {running ? (
          <div className="stack-8">
            <p className="status status--info" aria-live="polite">
              <Icon name="info" size={16} />
              {running.progress?.stage === "repairing" ? "Fixing animations" : "Generating"}
              {running.progress ? ` · ${running.progress.doneSegments} of ${running.progress.totalSegments} segments` : "…"}
              {running.progress?.receivedChars ? ` · ${running.progress.receivedChars.toLocaleString()} characters` : ""}
            </p>
            <Button variant="secondary" size="sm" onClick={cancelMotion}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" icon="effects" disabled={targets.length === 0} onClick={() => void generateMotion(targets, prompt)}>
            {targets.length === 0 ? "Nothing to animate" : `Generate motion for ${targets.length} segment${targets.length === 1 ? "" : "s"}`}
          </Button>
        )}
        <p className="hint">
          {settings.claudeModel} · effort {settings.effort}. Change in Settings.
        </p>
        {usage && (
          <p className="hint">
            Last generation: {usage.inputTokens.toLocaleString()} input tokens ({usage.cacheReadInputTokens.toLocaleString()} from cache), {usage.outputTokens.toLocaleString()} output tokens.
          </p>
        )}
      </PanelSection>

      <PanelSection>
        <h3 className="section-title">Motion clips · {motions.length}</h3>
        {outOfSync.length > 0 && (
          <>
            <p className="status status--warning">
              <Icon name="warning" size={16} /> {outOfSync.length} out of sync after edits
            </p>
            <Button variant="secondary" size="sm" disabled={!!running} onClick={() => void generateMotion(outOfSync.map((m) => ({ assetId: m.assetId, segmentId: m.segmentId })), prompt || outOfSync[0]!.prompt)}>
              Regenerate out-of-sync clips
            </Button>
          </>
        )}
        {selected && selPlacement ? (
          <div className="stack-8">
            <p className="panel-lead">{project.transcripts[selected.assetId]?.words.filter((w) => selected.wordIds.includes(w.id)).map((w) => w.text).join(" ")}</p>
            {selPlacement.status === "out_of_sync" ? (
              <p className="status status--warning">
                <Icon name="warning" size={16} /> Out of sync: words inside this clip were cut or moved.
              </p>
            ) : selPlacement.status === "orphaned" ? (
              <p className="status status--warning">
                <Icon name="warning" size={16} /> Not in the edit: its first word was cut.
              </p>
            ) : (
              <p className="status status--success">
                <Icon name="check" size={16} /> In sync · {timecode(selPlacement.startMs, project.settings.fps)}
              </p>
            )}
            <PanelRow label="Nudge">
              <Field label="Nudge in milliseconds" type="number" value={selected.offsetMs} unit="ms" onCommit={(v) => Number.isFinite(Number(v)) && patchSelected({ offsetMs: Math.round(Number(v)) })} />
            </PanelRow>
            <p className="hint">Style: {selected.prompt || "default"} · {selected.model}</p>
            <div className="button-row">
              <Button variant="secondary" size="sm" icon="effects" disabled={!!running} onClick={() => void generateMotion([{ assetId: selected.assetId, segmentId: selected.segmentId }], prompt || selected.prompt)}>
                Regenerate
              </Button>
              <Button variant="secondary" size="sm" icon={selected.hidden ? "eye" : "eye-off"} onClick={() => patchSelected({ hidden: !selected.hidden })}>
                {selected.hidden ? "Show clip" : "Hide clip"}
              </Button>
              <Button variant="secondary" size="sm" icon="trash" onClick={deleteSelection}>
                Delete clip
              </Button>
            </div>
          </div>
        ) : (
          <p className="hint">Select a motion clip on the timeline to nudge, hide or regenerate it.</p>
        )}
      </PanelSection>
    </Panel>
  );
}
