import { useEffect, useState } from "react";
import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, Field, Icon, Panel, PanelRow, PanelSection, SegmentedControl, Select } from "../ui";
import { ASPECTS, aspectOf, refreshWhisper } from "../../lib/actions";
import { CLAUDE_MODELS, EFFORTS, WHISPER_MODELS } from "../../lib/settings";
import * as ipc from "../../lib/ipc";

export function SettingsPanel() {
  const settings = useUi((s) => s.settings);
  const keyStatus = useUi((s) => s.keyStatus);
  const whisper = useUi((s) => s.whisper);
  const downloads = useUi((s) => s.downloads);
  const project = useProject((s) => s.project);
  const update = useUi.getState().updateSettings;
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    void refreshWhisper();
  }, []);

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const status = await ipc.claudeKeySet(key);
      useUi.getState().set({ keyStatus: status });
      setKey("");
      setMessage({ tone: "success", text: "Connected. The key is stored in your system keychain." });
    } catch (e) {
      setMessage({ tone: "danger", text: ipc.errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      await ipc.claudeTest();
      setMessage({ tone: "success", text: "Connection works." });
    } catch (e) {
      setMessage({ tone: "danger", text: ipc.errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await ipc.claudeKeyDelete();
    useUi.getState().set({ keyStatus: { connected: false, hint: null } });
    setMessage({ tone: "success", text: "Disconnected. The key was removed from your keychain." });
  };

  const download = async (name: string) => {
    useUi.getState().set({ downloads: { ...useUi.getState().downloads, [name]: 0 } });
    try {
      await ipc.downloadModel(name);
      await refreshWhisper();
    } catch (e) {
      if (ipc.errorKind(e) !== "cancelled") useUi.getState().notify({ tone: "danger", text: ipc.errorMessage(e) });
    } finally {
      const d = { ...useUi.getState().downloads };
      delete d[name];
      useUi.getState().set({ downloads: d });
    }
  };

  const setAspect = (v: string) => {
    const a = ASPECTS.find((x) => x.value === v);
    if (a) useProject.getState().commit((p) => ({ ...p, settings: { ...p.settings, width: a.width, height: a.height } }));
  };

  return (
    <Panel title="Settings">
      <PanelSection>
        <h3 className="section-title">Claude</h3>
        {keyStatus?.connected ? (
          <p className="status status--success">
            <Icon name="check" size={16} /> Connected ({keyStatus.hint})
          </p>
        ) : (
          <p className="status status--info">
            <Icon name="info" size={16} /> Not connected
          </p>
        )}
        <PanelRow label="API key">
          <Field label="Anthropic API key" type="password" value={key} placeholder={keyStatus?.connected ? "Replace key" : "sk-ant-…"} onChange={setKey} />
        </PanelRow>
        <div className="button-row">
          <Button variant="secondary" size="sm" disabled={busy || key.trim().length < 20} onClick={() => void connect()}>
            {keyStatus?.connected ? "Replace key" : "Connect"}
          </Button>
          {keyStatus?.connected && (
            <>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void test()}>
                Test connection
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void disconnect()}>
                Disconnect
              </Button>
            </>
          )}
        </div>
        {message && (
          <p className={`status status--${message.tone}`} role="status">
            <Icon name={message.tone === "success" ? "check" : "alert"} size={16} /> {message.text}
          </p>
        )}
        <p className="hint">Splits uses your key only for motion, from the app's Rust side. It never reaches the interface, project files or logs.</p>
        <PanelRow label="Model">
          <Select label="Claude model" value={settings.claudeModel} options={CLAUDE_MODELS.map((m) => ({ value: m.value, label: m.label }))} onChange={(v) => update({ claudeModel: v })} />
        </PanelRow>
        <PanelRow label="Effort">
          <Select label="Effort" value={settings.effort} options={EFFORTS.map((e) => ({ value: e, label: e }))} onChange={(v) => update({ effort: v as (typeof EFFORTS)[number] })} />
        </PanelRow>
        <p className="hint">Higher effort gives more polished motion and costs more tokens.</p>
      </PanelSection>

      <PanelSection>
        <h3 className="section-title">Transcription</h3>
        {whisper?.binary ? (
          <p className="status status--success" title={whisper.binary}>
            <Icon name="check" size={16} /> whisper.cpp found
          </p>
        ) : (
          <>
            <p className="status status--warning">
              <Icon name="warning" size={16} /> whisper.cpp not found
            </p>
            <p className="hint">Install it (on macOS: brew install whisper-cpp), or set SPLITS_WHISPER to the whisper-cli binary, then reopen this panel.</p>
          </>
        )}
        <PanelRow label="Model">
          <Select label="Transcription model" value={settings.whisperModel} options={[...WHISPER_MODELS]} onChange={(v) => update({ whisperModel: v as (typeof WHISPER_MODELS)[number] })} />
        </PanelRow>
        <ul className="model-list" aria-label="Transcription models">
          {(whisper?.models ?? []).map((m) => (
            <li key={m.name} className="model-row">
              <span>
                {m.name} <span className="hint">· {Math.round(m.sizeBytes / 1_000_000)} MB</span>
              </span>
              {m.installed ? (
                <span className="status status--success">
                  <Icon name="check" size={16} /> Installed
                </span>
              ) : downloads[m.name] !== undefined ? (
                <span className="button-row">
                  <span className="status status--info">{Math.round((downloads[m.name] ?? 0) * 100)}%</span>
                  <Button variant="ghost" size="sm" onClick={() => void ipc.cancelJob(`model-${m.name}`)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <Button variant="ghost" size="sm" icon="export" onClick={() => void download(m.name)}>
                  Download
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="hint">tiny.en is fastest. base.en and small.en are more accurate, which makes motion timing better.</p>
      </PanelSection>

      <PanelSection>
        <h3 className="section-title">Project</h3>
        <PanelRow label="Canvas">
          <Select label="Canvas aspect ratio" value={aspectOf(project)} options={ASPECTS.map((a) => ({ value: a.value, label: `${a.label} (${a.width}×${a.height})` }))} onChange={setAspect} />
        </PanelRow>
        <p className="hint">
          Frame rate: {(project.settings.fps.num / project.settings.fps.den).toFixed(project.settings.fps.den === 1 ? 0 : 3)} fps, from the first video you added.
        </p>
        <PanelRow label="Theme">
          <SegmentedControl
            label="Theme"
            value={settings.theme}
            onChange={(v) => update({ theme: v as "dark" | "light" })}
            options={[
              { value: "dark", text: "Dark" },
              { value: "light", text: "Light" },
            ]}
          />
        </PanelRow>
      </PanelSection>
    </Panel>
  );
}
