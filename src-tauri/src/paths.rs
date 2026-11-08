//! Where Splits keeps its files, and the guard that keeps file commands inside them.
//!
//! Everything lives under the platform app-data directory
//! (`tauri::path::BaseDirectory::AppData`), never a hard-coded path:
//!
//! ```text
//! <AppData>/proxies/<asset-id>.mp4      720p editing proxies
//! <AppData>/thumbs/<asset-id>/0001.jpg   timeline thumbnails
//! <AppData>/models/ggml-<name>.bin       whisper models
//! <AppData>/projects/<project-id>/       project.json + motion/<clip-id>.json
//! <AppData>/tmp/                         scratch (audio extracts, export frames)
//! ```

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

pub fn app_data(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn sub(app: &AppHandle, parts: &[&str]) -> AppResult<PathBuf> {
    let mut dir = app_data(app)?;
    for p in parts {
        dir.push(p);
    }
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// IDs arrive from the WebView and become path segments, so they must be plain.
pub fn safe_id(id: &str) -> AppResult<&str> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(id)
    } else {
        Err(AppError::Invalid(format!("Invalid id: {id:?}")))
    }
}

pub fn project_dir(app: &AppHandle, project_id: &str) -> AppResult<PathBuf> {
    sub(app, &["projects", safe_id(project_id)?])
}

pub fn motion_dir(app: &AppHandle, project_id: &str) -> AppResult<PathBuf> {
    sub(app, &["projects", safe_id(project_id)?, "motion"])
}

/// Resolve `path` and refuse anything outside the app-data directory.
/// Used by commands that read files on the WebView's behalf.
pub fn ensure_inside(app: &AppHandle, path: &Path) -> AppResult<PathBuf> {
    let root = app_data(app)?.canonicalize()?;
    let resolved = path.canonicalize()?;
    if resolved.starts_with(&root) {
        Ok(resolved)
    } else {
        Err(AppError::Invalid("That file is outside the Splits data folder.".into()))
    }
}
