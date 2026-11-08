//! Offline transcription with whisper.cpp, down to the word.
//!
//! 1. FFmpeg extracts mono 16 kHz WAV, the only format whisper.cpp reads.
//! 2. `whisper-cli -ml 1 -sow -oj` writes JSON where each segment is one word,
//!    with `offsets.from` / `offsets.to` in milliseconds.
//! 3. We clean the words (drop `[BLANK_AUDIO]`-style tags, glue stray
//!    punctuation onto the previous word), give each a stable ID, and group
//!    them into caption segments.
//!
//! Word IDs are the anchor everything else hangs off: captions and motion
//! clips refer to them, never to absolute times.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{bin, models, process};
use crate::error::{AppError, AppResult};
use crate::jobs::CancelRx;
use crate::paths;

/// A caption segment ends at a long pause, at the end of a sentence, or when
/// it would no longer fit on one 42-character line or in 3.5 seconds.
pub const SEGMENT_MAX_CHARS: usize = 42;
pub const SEGMENT_MAX_MS: u64 = 3500;
pub const SEGMENT_GAP_MS: u64 = 700;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub id: String,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: String,
    pub first_word_id: String,
    pub last_word_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub asset_id: String,
    pub model: String,
    pub language: String,
    pub words: Vec<Word>,
    pub segments: Vec<Segment>,
}

pub async fn transcribe(
    app: &tauri::AppHandle,
    asset_id: &str,
    source: &Path,
    model: &str,
    cancel: CancelRx,
) -> AppResult<Transcript> {
    let ffmpeg = bin::ffmpeg()?;
    let whisper = bin::whisper()?;
    let model_path = models::installed_path(app, model)?.ok_or_else(|| AppError::ModelMissing(model.to_string()))?;

    let tmp = paths::sub(app, &["tmp"])?;
    let id = paths::safe_id(asset_id)?;
    let wav = tmp.join(format!("{id}.16k.wav"));
    let out_base: PathBuf = tmp.join(format!("{id}.words"));

    process::run_ffmpeg(
        &ffmpeg,
        [
            "-y".to_string(),
            "-i".into(),
            source.to_string_lossy().into_owned(),
            "-vn".into(),
            "-ac".into(),
            "1".into(),
            "-ar".into(),
            "16000".into(),
            "-c:a".into(),
            "pcm_s16le".into(),
            wav.to_string_lossy().into_owned(),
        ],
        0,
        Some(cancel.clone()),
        |_| {},
    )
    .await?;

    let threads = std::thread::available_parallelism().map(|n| n.get().min(8)).unwrap_or(4).to_string();
    let lang = if model.ends_with(".en") { "en" } else { "auto" };
    let result = process::run_capture(
        &whisper,
        [
            "-m".as_ref(),
            model_path.as_os_str(),
            "-f".as_ref(),
            wav.as_os_str(),
            "-l".as_ref(),
            lang.as_ref(),
            "-t".as_ref(),
            threads.as_ref(),
            "-ml".as_ref(),
            "1".as_ref(),
            "-sow".as_ref(),
            "-oj".as_ref(),
            "-of".as_ref(),
            out_base.as_os_str(),
            "-np".as_ref(),
        ],
        Some(cancel),
    )
    .await;
    let _ = tokio::fs::remove_file(&wav).await;
    result?;

    let json_path = out_base.with_extension("words.json");
    let raw = tokio::fs::read(&json_path).await?;
    let _ = tokio::fs::remove_file(&json_path).await;
    let v: Value = serde_json::from_slice(&raw)?;
    let words = parse_whisper_words(&v);
    let segments = group_segments(&words);
    Ok(Transcript {
        asset_id: asset_id.to_string(),
        model: model.to_string(),
        language: v["result"]["language"].as_str().unwrap_or(lang).to_string(),
        words,
        segments,
    })
}

fn is_tag(t: &str) -> bool {
    let t = t.trim();
    (t.starts_with('[') && t.ends_with(']')) || (t.starts_with('(') && t.ends_with(')'))
}

fn is_punct_only(t: &str) -> bool {
    !t.trim().is_empty() && t.trim().chars().all(|c| c.is_ascii_punctuation() || c == '…')
}

pub fn parse_whisper_words(v: &Value) -> Vec<Word> {
    let mut words: Vec<Word> = Vec::new();
    for seg in v["transcription"].as_array().into_iter().flatten() {
        let text = seg["text"].as_str().unwrap_or("").trim().to_string();
        if text.is_empty() || is_tag(&text) {
            continue;
        }
        let from = seg["offsets"]["from"].as_u64().unwrap_or(0);
        let to = seg["offsets"]["to"].as_u64().unwrap_or(from);
        if is_punct_only(&text) {
            if let Some(prev) = words.last_mut() {
                prev.text.push_str(&text);
                prev.end_ms = prev.end_ms.max(to);
            }
            continue;
        }
        words.push(Word { id: String::new(), text, start_ms: from, end_ms: to.max(from + 1) });
    }
    // Whisper occasionally emits overlapping or backwards offsets; keep them monotonic.
    let mut floor = 0;
    for (i, w) in words.iter_mut().enumerate() {
        w.id = format!("w_{:05}", i + 1);
        w.start_ms = w.start_ms.max(floor);
        w.end_ms = w.end_ms.max(w.start_ms + 1);
        floor = w.start_ms;
    }
    words
}

pub fn group_segments(words: &[Word]) -> Vec<Segment> {
    let mut segments = Vec::new();
    let mut start: Option<usize> = None;
    let mut chars = 0usize;
    for (i, w) in words.iter().enumerate() {
        if let Some(s) = start {
            let first = &words[s];
            let prev = &words[i - 1];
            let gap = w.start_ms.saturating_sub(prev.end_ms);
            let sentence_end = prev.text.ends_with(['.', '?', '!', '…']);
            let too_long = chars + 1 + w.text.chars().count() > SEGMENT_MAX_CHARS;
            let too_slow = w.end_ms.saturating_sub(first.start_ms) > SEGMENT_MAX_MS;
            if gap > SEGMENT_GAP_MS || sentence_end || too_long || too_slow {
                segments.push(Segment {
                    id: format!("s_{:04}", segments.len() + 1),
                    first_word_id: first.id.clone(),
                    last_word_id: prev.id.clone(),
                });
                start = None;
            }
        }
        if start.is_none() {
            start = Some(i);
            chars = w.text.chars().count();
        } else {
            chars += 1 + w.text.chars().count();
        }
    }
    if let (Some(s), Some(last)) = (start, words.last()) {
        segments.push(Segment {
            id: format!("s_{:04}", segments.len() + 1),
            first_word_id: words[s].id.clone(),
            last_word_id: last.id.clone(),
        });
    }
    segments
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn seg(text: &str, from: u64, to: u64) -> Value {
        json!({"offsets": {"from": from, "to": to}, "text": text})
    }

    #[test]
    fn cleans_tags_and_glues_punctuation() {
        let v = json!({"transcription": [
            seg(" [BLANK_AUDIO]", 0, 500),
            seg(" Hello", 500, 800),
            seg(",", 800, 820),
            seg(" world", 900, 1200),
            seg(".", 1200, 1210),
        ]});
        let w = parse_whisper_words(&v);
        assert_eq!(w.len(), 2);
        assert_eq!(w[0].text, "Hello,");
        assert_eq!(w[0].id, "w_00001");
        assert_eq!(w[1].text, "world.");
        assert_eq!(w[1].end_ms, 1210);
    }

    #[test]
    fn keeps_offsets_monotonic() {
        let v = json!({"transcription": [seg(" a", 1000, 1100), seg(" b", 900, 950)]});
        let w = parse_whisper_words(&v);
        assert!(w[1].start_ms >= w[0].start_ms);
        assert!(w[1].end_ms > w[1].start_ms);
    }

    fn word(i: usize, text: &str, s: u64, e: u64) -> Word {
        Word { id: format!("w_{i}"), text: text.into(), start_ms: s, end_ms: e }
    }

    #[test]
    fn segments_break_on_sentence_pause_and_length() {
        let words = vec![
            word(1, "Hi", 0, 200),
            word(2, "there.", 250, 500),
            word(3, "Next", 600, 800),
            word(4, "line", 2000, 2200), // long pause before
        ];
        let s = group_segments(&words);
        assert_eq!(s.len(), 3);
        assert_eq!((s[0].first_word_id.as_str(), s[0].last_word_id.as_str()), ("w_1", "w_2"));
        assert_eq!(s[1].first_word_id, "w_3");
        assert_eq!(s[2].first_word_id, "w_4");

        let long: Vec<Word> = (0..20).map(|i| word(i, "word", i as u64 * 100, i as u64 * 100 + 90)).collect();
        for seg in group_segments(&long) {
            let a: usize = seg.first_word_id[2..].parse().unwrap();
            let b: usize = seg.last_word_id[2..].parse().unwrap();
            assert!((b - a + 1) * 5 - 1 <= SEGMENT_MAX_CHARS);
        }
    }
}
