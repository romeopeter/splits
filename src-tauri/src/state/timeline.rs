//! The export contract: the timeline as the frontend hands it to Rust.
//!
//! The React store owns the editable project. At export it resolves the
//! project into this flat, render-ready shape: every visible clip with its
//! source path, timeline start and source range, bottom layer first. Rust
//! turns it into one FFmpeg command and never needs to understand tracks,
//! words or undo history.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExportTarget {
    /// One MP4 with video, audio, captions and motion.
    Mp4,
    /// The overlay layer alone (captions + motion) as ProRes 4444 with alpha.
    MotionMov,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Transform {
    /// Offset from the canvas centre, in output pixels.
    pub x: f64,
    pub y: f64,
    /// 1.0 = fit inside the canvas.
    pub scale: f64,
    /// 0.0..=1.0
    pub opacity: f64,
}

impl Default for Transform {
    fn default() -> Self {
        Self { x: 0.0, y: 0.0, scale: 1.0, opacity: 1.0 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChromaKey {
    /// `#RRGGBB`
    pub color: String,
    /// 0.0..=1.0 chroma distance below which a pixel is fully transparent.
    pub similarity: f64,
    /// 0.0..=1.0 width of the soft edge above `similarity`.
    pub smoothness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VisualClip {
    pub source_path: String,
    pub source_width: u32,
    pub source_height: u32,
    pub start_ms: u64,
    pub in_ms: u64,
    pub out_ms: u64,
    #[serde(default)]
    pub transform: Transform,
    #[serde(default)]
    pub chroma_key: Option<ChromaKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioClip {
    pub source_path: String,
    pub start_ms: u64,
    pub in_ms: u64,
    pub out_ms: u64,
    /// 0.0..=2.0, 1.0 = unchanged.
    pub volume: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySequence {
    /// Folder of `000000.png`, `000001.png`, … one per output frame.
    pub dir: String,
    pub frame_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub job_id: String,
    pub target: ExportTarget,
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub fps_num: u32,
    pub fps_den: u32,
    pub duration_ms: u64,
    /// Bottom layer first.
    pub visual: Vec<VisualClip>,
    pub audio: Vec<AudioClip>,
    pub overlay: Option<OverlaySequence>,
}
