//! The editing proxy pipeline: a light copy of each import for scrubbing and playback.
//!
//! The WebView never touches original media. On import we make, in order:
//! 1. a proxy: 720p (shorter side) H.264 with a short GOP so seeking is fast,
//!    or AAC for audio-only files;
//! 2. timeline thumbnails, from the proxy;
//! 3. waveform peaks, from the original audio.
//!
//! Each stage reports through the `media-job` event.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::process::Command;

use super::{bin, parser::MediaInfo, process};
use crate::error::{AppError, AppResult};
use crate::paths;

pub const PEAKS_PER_SECOND: u32 = 50;
const PEAK_SAMPLE_RATE: u32 = 8000;
const MAX_THUMBNAILS: u64 = 120;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaJobEvent {
    pub asset_id: String,
    pub stage: &'static str,
    pub status: &'static str,
    pub progress: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnails: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_interval_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peaks: Option<Vec<f32>>,
}

impl MediaJobEvent {
    fn new(asset_id: &str, stage: &'static str, status: &'static str, progress: f64) -> Self {
        Self {
            asset_id: asset_id.to_string(),
            stage,
            status,
            progress,
            error: None,
            proxy_path: None,
            thumbnails: None,
            thumbnail_interval_ms: None,
            peaks: None,
        }
    }
}

fn emit(app: &AppHandle, ev: MediaJobEvent) {
    let _ = app.emit("media-job", ev);
}

/// Run all stages for one asset. Errors are reported as events, not returned,
/// because this runs detached after `import_media` has already answered.
pub async fn run_pipeline(app: AppHandle, asset_id: String, source: PathBuf, info: MediaInfo) {
    let proxy = match make_proxy(&app, &asset_id, &source, &info).await {
        Ok(p) => p,
        Err(e) => {
            let mut ev = MediaJobEvent::new(&asset_id, "proxy", "failed", 0.0);
            ev.error = Some(e.to_string());
            emit(&app, ev);
            return;
        }
    };
    let mut ev = MediaJobEvent::new(&asset_id, "proxy", "done", 1.0);
    ev.proxy_path = Some(proxy.to_string_lossy().into_owned());
    emit(&app, ev);

    if info.has_video {
        match make_thumbnails(&app, &asset_id, &proxy, info.duration_ms).await {
            Ok((thumbs, interval)) => {
                let mut ev = MediaJobEvent::new(&asset_id, "thumbnails", "done", 1.0);
                ev.thumbnails = Some(thumbs);
                ev.thumbnail_interval_ms = Some(interval);
                emit(&app, ev);
            }
            Err(e) => tracing::warn!(error = %e, "thumbnails failed"),
        }
    }

    if info.has_audio {
        match make_peaks(&source).await {
            Ok(peaks) => {
                let mut ev = MediaJobEvent::new(&asset_id, "peaks", "done", 1.0);
                ev.peaks = Some(peaks);
                emit(&app, ev);
            }
            Err(e) => tracing::warn!(error = %e, "waveform failed"),
        }
    }
}

/// The proxy for an asset, if a finished one is already on disk.
pub fn existing_proxy(app: &AppHandle, asset_id: &str) -> AppResult<Option<PathBuf>> {
    let dir = paths::sub(app, &["proxies"])?;
    let id = paths::safe_id(asset_id)?;
    Ok(["mp4", "m4a"].iter().map(|ext| dir.join(format!("{id}.{ext}"))).find(|p| p.is_file()))
}

pub fn emit_ready(app: &AppHandle, asset_id: &str, proxy: &Path) {
    let mut ev = MediaJobEvent::new(asset_id, "proxy", "done", 1.0);
    ev.proxy_path = Some(proxy.to_string_lossy().into_owned());
    emit(app, ev);
}

/// Scale so the shorter side is 720px, keeping aspect and even dimensions.
pub fn proxy_scale_filter() -> &'static str {
    "scale='if(gte(iw,ih),-2,720)':'if(gte(iw,ih),720,-2)'"
}

pub fn proxy_args(source: &Path, out: &Path, info: &MediaInfo) -> Vec<String> {
    let mut a: Vec<String> = vec!["-y".into(), "-i".into(), source.to_string_lossy().into_owned()];
    if info.has_video {
        a.extend(
            [
                "-map", "0:v:0", "-map", "0:a:0?", "-vf", proxy_scale_filter(), "-c:v", "libx264", "-preset",
                "veryfast", "-crf", "28", "-g", "15", "-keyint_min", "15", "-pix_fmt", "yuv420p", "-c:a", "aac",
                "-b:a", "128k", "-ac", "2", "-movflags", "+faststart",
            ]
            .map(String::from),
        );
    } else {
        a.extend(["-vn", "-map", "0:a:0", "-c:a", "aac", "-b:a", "160k", "-ac", "2"].map(String::from));
    }
    a.push(out.to_string_lossy().into_owned());
    a
}

async fn make_proxy(app: &AppHandle, asset_id: &str, source: &Path, info: &MediaInfo) -> AppResult<PathBuf> {
    let ffmpeg = bin::ffmpeg()?;
    let dir = paths::sub(app, &["proxies"])?;
    let ext = if info.has_video { "mp4" } else { "m4a" };
    let out = dir.join(format!("{}.{ext}", paths::safe_id(asset_id)?));
    let partial = dir.join(format!("{asset_id}.partial.{ext}"));
    let app2 = app.clone();
    let id = asset_id.to_string();
    let mut last = -1.0;
    process::run_ffmpeg(&ffmpeg, proxy_args(source, &partial, info), info.duration_ms, None, move |p| {
        if p - last >= 0.02 {
            last = p;
            emit(&app2, MediaJobEvent::new(&id, "proxy", "running", p));
        }
    })
    .await?;
    tokio::fs::rename(&partial, &out).await?;
    Ok(out)
}

async fn make_thumbnails(app: &AppHandle, asset_id: &str, proxy: &Path, duration_ms: u64) -> AppResult<(Vec<String>, u64)> {
    let ffmpeg = bin::ffmpeg()?;
    let dir = paths::sub(app, &["thumbs", paths::safe_id(asset_id)?])?;
    let interval_ms = (duration_ms / MAX_THUMBNAILS).max(1000);
    let fps = format!("fps=1000/{interval_ms},scale=-2:72");
    let pattern = dir.join("%04d.jpg");
    process::run_ffmpeg(
        &ffmpeg,
        [
            "-y".to_string(),
            "-i".into(),
            proxy.to_string_lossy().into_owned(),
            "-vf".into(),
            fps,
            "-q:v".into(),
            "6".into(),
            pattern.to_string_lossy().into_owned(),
        ],
        duration_ms,
        None,
        |_| {},
    )
    .await?;
    let mut files: Vec<String> = std::fs::read_dir(&dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "jpg"))
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    files.sort();
    Ok((files, interval_ms))
}

/// Decode mono 8 kHz PCM and keep the peak of each 20 ms window, scaled 0..1.
async fn make_peaks(source: &Path) -> AppResult<Vec<f32>> {
    let ffmpeg = bin::ffmpeg()?;
    let mut child = Command::new(ffmpeg)
        .args(["-hide_banner", "-nostdin", "-v", "error", "-i"])
        .arg(source)
        .args(["-vn", "-ac", "1", "-ar", &PEAK_SAMPLE_RATE.to_string(), "-f", "s16le", "-"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()?;
    let mut stdout = child.stdout.take().expect("piped stdout");
    let mut bytes = Vec::new();
    stdout.read_to_end(&mut bytes).await?;
    let status = child.wait().await?;
    if !status.success() {
        return Err(AppError::Media("Could not read the audio for the waveform.".into()));
    }
    Ok(peaks_from_pcm(&bytes, (PEAK_SAMPLE_RATE / PEAKS_PER_SECOND) as usize))
}

pub fn peaks_from_pcm(bytes: &[u8], window: usize) -> Vec<f32> {
    let samples: Vec<i16> = bytes.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]])).collect();
    let peaks: Vec<f32> = samples
        .chunks(window.max(1))
        .map(|w| w.iter().map(|s| s.unsigned_abs()).max().unwrap_or(0) as f32 / i16::MAX as f32)
        .collect();
    let max = peaks.iter().cloned().fold(0.0_f32, f32::max);
    let scale = if max > 0.0 { 1.0 / max } else { 1.0 };
    peaks.iter().map(|p| ((p * scale).min(1.0) * 100.0).round() / 100.0).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peaks_are_normalised_per_window() {
        let samples: [i16; 6] = [0, 1000, -2000, 500, 0, 0];
        let bytes: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
        let peaks = peaks_from_pcm(&bytes, 2);
        assert_eq!(peaks, vec![0.5, 1.0, 0.0]);
    }

    #[test]
    fn audio_only_proxy_has_no_video_args() {
        let info = MediaInfo {
            duration_ms: 1000,
            has_video: false,
            has_audio: true,
            width: None,
            height: None,
            fps_num: None,
            fps_den: None,
        };
        let a = proxy_args(Path::new("in.wav"), Path::new("out.m4a"), &info);
        assert!(a.contains(&"-vn".to_string()));
        assert!(!a.contains(&"libx264".to_string()));
    }
}
