/**
 * Per-device preferences. Not secrets: the Claude key lives in the OS
 * keychain via Rust. Stored in localStorage, wrapped in try/catch so a
 * blocked or empty store just means defaults.
 */
export const CLAUDE_MODELS = [
  { value: "claude-opus-5-5", label: "Claude Opus 5.5 (best quality)" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (faster)" },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest)" },
] as const;

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export const WHISPER_MODELS = ["tiny.en", "base.en", "small.en"] as const;

export interface Settings {
  theme: "dark" | "light";
  claudeModel: string;
  effort: (typeof EFFORTS)[number];
  whisperModel: (typeof WHISPER_MODELS)[number];
  motionNoticeSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  claudeModel: "claude-opus-5-5",
  effort: "high",
  whisperModel: "tiny.en",
  motionNoticeSeen: false,
};

const KEY = "split.settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}
