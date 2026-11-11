//! Finding the external binaries Split drives: ffmpeg, ffprobe and whisper-cli.
//!
//! Lookup order: an environment override, a sidecar next to the app executable,
//! then PATH plus the usual package-manager folders. The last step matters on
//! macOS: apps launched from Finder do not inherit the shell's PATH, so
//! Homebrew's `/opt/homebrew/bin` would otherwise be invisible.

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

const EXTRA_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/opt/local/bin",
    "C:\\ffmpeg\\bin",
];

fn exe_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

fn is_file(p: &Path) -> bool {
    p.is_file()
}

pub fn find(env_var: &str, names: &[&str]) -> Option<PathBuf> {
    if let Ok(v) = std::env::var(env_var) {
        let p = PathBuf::from(v);
        if is_file(&p) {
            return Some(p);
        }
    }
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
    let path_dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    for name in names {
        let file = exe_name(name);
        let candidates = exe_dir
            .iter()
            .cloned()
            .chain(path_dirs.iter().cloned())
            .chain(EXTRA_DIRS.iter().map(PathBuf::from));
        for dir in candidates {
            let p = dir.join(&file);
            if is_file(&p) {
                return Some(p);
            }
        }
    }
    None
}

pub fn ffmpeg() -> AppResult<PathBuf> {
    find("SPLIT_FFMPEG", &["ffmpeg"]).ok_or(AppError::FfmpegMissing)
}

pub fn ffprobe() -> AppResult<PathBuf> {
    find("SPLIT_FFPROBE", &["ffprobe"]).ok_or(AppError::FfmpegMissing)
}

pub fn whisper() -> AppResult<PathBuf> {
    find("SPLIT_WHISPER", &["whisper-cli", "whisper-cpp", "whisper"]).ok_or(AppError::WhisperMissing)
}
