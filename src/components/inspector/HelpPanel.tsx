import { Panel, PanelSection } from "../ui";

const mod = navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Ctrl";

const SHORTCUTS: [string, string][] = [
  ["Play or pause", "Space"],
  ["Split at playhead", "S"],
  ["Blade tool (click a clip to split)", "B"],
  ["Select tool", "V"],
  ["Step one frame", "Left or Right"],
  ["Step one second", "Shift + Left or Right"],
  ["Jump to start or end", "Home or End"],
  ["Jump to previous or next edit point", "Up or Down"],
  ["Trim start or end to playhead", "[ or ]"],
  ["Trim start or end and close the gap", "Q or W"],
  ["Delete selected clip", "Delete or Backspace"],
  ["Delete and close the gap", "Shift + Delete or Backspace"],
  ["Move track up or down (track header focused)", "Alt + Up or Down"],
  ["Duplicate", `${mod} + D`],
  ["Undo", `${mod} + Z`],
  ["Redo", `${mod} + Shift + Z`],
  ["Zoom timeline in or out", "+ or −"],
  ["Fit timeline", "Shift + 0"],
  ["Nudge canvas object", "Arrow keys, Shift for 10 px"],
  ["Deselect", "Escape"],
];

export function HelpPanel() {
  return (
    <Panel title="Help">
      <PanelSection>
        <p className="hint">
          Add media, generate captions, then describe a style in Motion. Edit freely: captions and motion follow the words they belong to.
        </p>
      </PanelSection>
      <PanelSection>
        <h3 className="section-title">Keyboard shortcuts</h3>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([action, keys]) => (
              <tr key={action}>
                <th scope="row">{action}</th>
                <td>{keys}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Single-key shortcuts are off while you type in a field.</p>
      </PanelSection>
    </Panel>
  );
}
