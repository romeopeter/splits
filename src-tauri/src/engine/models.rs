//! whisper.cpp model files: which are installed, and user-initiated downloads.
//!
//! This and `ai/` are the only modules allowed to use the network. A download
//! only starts when the person presses Download in Settings.

use std::path::PathBuf;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

use crate::error::{AppError, AppResult};
use crate::jobs::CancelRx;
use crate::paths;

/// Model names and approximate sizes in bytes (for display before download).
pub const KNOWN_MODELS: &[(&str, u64)] = &[
    ("tiny.en", 77_704_715),
    ("base.en", 147_964_211),
    ("small.en", 487_614_201),
];

const BASE_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

fn check_name(name: &str) -> AppResult<()> {
    if KNOWN_MODELS.iter().any(|(n, _)| *n == name) {
        Ok(())
    } else {
        Err(AppError::Invalid(format!("Unknown transcription model: {name}")))
    }
}

fn file_name(name: &str) -> String {
    format!("ggml-{name}.bin")
}

pub fn installed_path(app: &AppHandle, name: &str) -> AppResult<Option<PathBuf>> {
    check_name(name)?;
    if let Ok(p) = std::env::var("SPLIT_WHISPER_MODEL") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Ok(Some(p));
        }
    }
    let p = paths::sub(app, &["models"])?.join(file_name(name));
    Ok(p.is_file().then_some(p))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub name: String,
    pub installed: bool,
    pub size_bytes: u64,
}

pub fn list(app: &AppHandle) -> AppResult<Vec<ModelStatus>> {
    KNOWN_MODELS
        .iter()
        .map(|(n, size)| {
            Ok(ModelStatus { name: n.to_string(), installed: installed_path(app, n)?.is_some(), size_bytes: *size })
        })
        .collect()
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadEvent {
    name: String,
    progress: f64,
}

pub async fn download(app: &AppHandle, name: &str, mut cancel: CancelRx) -> AppResult<()> {
    check_name(name)?;
    let dir = paths::sub(app, &["models"])?;
    let dest = dir.join(file_name(name));
    let partial = dir.join(format!("{}.part", file_name(name)));
    let url = format!("{BASE_URL}/{}", file_name(name));

    let resp = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Media(format!("Download failed. Check your connection and try again. ({e})")))?;
    if !resp.status().is_success() {
        return Err(AppError::Media(format!("Download failed with status {}.", resp.status())));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&partial).await?;
    let mut stream = resp.bytes_stream();
    let mut received: u64 = 0;
    let mut last = 0.0;
    loop {
        let chunk = tokio::select! {
            c = stream.next() => c,
            _ = crate::jobs::cancelled(&mut cancel) => {
                drop(file);
                let _ = tokio::fs::remove_file(&partial).await;
                return Err(AppError::Cancelled);
            }
        };
        let Some(chunk) = chunk else { break };
        let chunk = chunk.map_err(|e| AppError::Media(format!("Download interrupted. Try again. ({e})")))?;
        file.write_all(&chunk).await?;
        received += chunk.len() as u64;
        if total > 0 {
            let p = received as f64 / total as f64;
            if p - last >= 0.01 {
                last = p;
                let _ = app.emit("model-download", DownloadEvent { name: name.into(), progress: p });
            }
        }
    }
    file.flush().await?;
    drop(file);
    if total > 0 && received != total {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(AppError::Media("Download was incomplete. Try again.".into()));
    }
    tokio::fs::rename(&partial, &dest).await?;
    let _ = app.emit("model-download", DownloadEvent { name: name.into(), progress: 1.0 });
    Ok(())
}
