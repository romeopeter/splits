//! Tauri commands: the whole surface the WebView can call.
//!
//! Keep these thin. They validate input from the WebView (IDs, paths), then
//! hand off to `engine`, `ai`, `secrets` or `state`.

use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::ai::{claude, motion};
use crate::engine::{exporter, models, parser, proxy, transcribe};
use crate::error::{AppError, AppResult};
use crate::jobs::Jobs;
use crate::state::{project, timeline::ExportRequest};
use crate::{paths, secrets};

// ---------- Media ----------

#[tauri::command]
pub async fn import_media(app: AppHandle, asset_id: String, path: String) -> AppResult<parser::MediaInfo> {
    paths::safe_id(&asset_id)?;
    let source = PathBuf::from(&path);
    if !source.is_file() {
        return Err(AppError::Media(format!("Could not find {path}.")));
    }
    let info = parser::probe(&source).await?;
    tauri::async_runtime::spawn(proxy::run_pipeline(app, asset_id, source, info.clone()));
    Ok(info)
}

/// On project load: confirm each asset's proxy still exists, rebuilding it
/// (and thumbnails and peaks) only when the cache was cleared or the project
/// moved to another machine.
#[tauri::command]
pub async fn ensure_media(app: AppHandle, asset_id: String, path: String) -> AppResult<()> {
    paths::safe_id(&asset_id)?;
    if let Some(existing) = proxy::existing_proxy(&app, &asset_id)? {
        proxy::emit_ready(&app, &asset_id, &existing);
        return Ok(());
    }
    let source = PathBuf::from(&path);
    if !source.is_file() {
        return Err(AppError::Media(format!("The original file is missing: {path}. Move it back, then reopen the project.")));
    }
    let info = parser::probe(&source).await?;
    tauri::async_runtime::spawn(proxy::run_pipeline(app, asset_id, source, info));
    Ok(())
}

// ---------- Transcription ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperStatus {
    pub binary: Option<String>,
    pub models: Vec<models::ModelStatus>,
}

#[tauri::command]
pub fn whisper_status(app: AppHandle) -> AppResult<WhisperStatus> {
    Ok(WhisperStatus {
        binary: crate::engine::bin::whisper().ok().map(|p| p.to_string_lossy().into_owned()),
        models: models::list(&app)?,
    })
}

#[tauri::command]
pub async fn transcribe_asset(
    app: AppHandle,
    jobs: State<'_, Jobs>,
    job_id: String,
    asset_id: String,
    path: String,
    model: String,
) -> AppResult<transcribe::Transcript> {
    let cancel = jobs.register(&job_id);
    let result = transcribe::transcribe(&app, &asset_id, &PathBuf::from(path), &model, cancel).await;
    jobs.finish(&job_id);
    result
}

#[tauri::command]
pub async fn download_model(app: AppHandle, jobs: State<'_, Jobs>, name: String) -> AppResult<()> {
    let job = format!("model-{name}");
    let cancel = jobs.register(&job);
    let result = models::download(&app, &name, cancel).await;
    jobs.finish(&job);
    result
}

#[tauri::command]
pub fn cancel_job(jobs: State<'_, Jobs>, job_id: String) -> bool {
    jobs.cancel(&job_id)
}

// ---------- Claude ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    pub connected: bool,
    pub hint: Option<String>,
}

/// Test the key first and store it only if Anthropic accepts it.
#[tauri::command]
pub async fn claude_key_set(key: String) -> AppResult<KeyStatus> {
    let key = key.trim().to_string();
    claude::test_key(&claude::client(), &key).await?;
    secrets::set(key.clone()).await?;
    Ok(KeyStatus { connected: true, hint: Some(secrets::hint(&key)) })
}

#[tauri::command]
pub async fn claude_key_status() -> AppResult<KeyStatus> {
    let key = secrets::get().await?;
    Ok(KeyStatus { connected: key.is_some(), hint: key.as_deref().map(secrets::hint) })
}

#[tauri::command]
pub async fn claude_key_delete() -> AppResult<()> {
    secrets::delete().await
}

#[tauri::command]
pub async fn claude_test() -> AppResult<()> {
    let key = secrets::require().await?;
    claude::test_key(&claude::client(), &key).await
}

#[tauri::command]
pub async fn motion_generate(
    app: AppHandle,
    jobs: State<'_, Jobs>,
    request: motion::MotionRequest,
) -> AppResult<motion::MotionResult> {
    let key = secrets::require().await?;
    let cancel = jobs.register(&request.request_id);
    let result = motion::generate(&app, key, &request, cancel).await;
    jobs.finish(&request.request_id);
    result
}

/// Read a file Splits wrote (motion JSON), refusing anything outside app data.
#[tauri::command]
pub fn read_app_file(app: AppHandle, path: String) -> AppResult<String> {
    let p = paths::ensure_inside(&app, &PathBuf::from(path))?;
    Ok(std::fs::read_to_string(p)?)
}

// ---------- Projects ----------

#[tauri::command]
pub fn project_save(app: AppHandle, project: Value) -> AppResult<()> {
    project::save(&app, &project)
}

#[tauri::command]
pub fn project_load_last(app: AppHandle) -> AppResult<Option<Value>> {
    project::load_last(&app)
}

#[tauri::command]
pub fn project_load(app: AppHandle, id: String) -> AppResult<Option<Value>> {
    project::load(&app, &id)
}

#[tauri::command]
pub fn project_list(app: AppHandle) -> AppResult<Vec<project::ProjectSummary>> {
    project::list(&app)
}

// ---------- Export ----------

fn overlay_dir(app: &AppHandle, job_id: &str) -> AppResult<PathBuf> {
    paths::sub(app, &["tmp", &format!("overlay-{}", paths::safe_id(job_id)?)])
}

/// Prepare an empty folder for the overlay PNG sequence and return its path.
#[tauri::command]
pub fn overlay_begin(app: AppHandle, job_id: String) -> AppResult<String> {
    let dir = overlay_dir(&app, &job_id)?;
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir)?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Receive one overlay frame as a raw PNG body.
///
/// Headers: `x-job` (job id), `x-index` (frame number), and optionally
/// `x-blank: set` (this PNG is the shared empty frame) or `x-blank: use`
/// (no body; link the shared empty frame). Most frames of a video have no
/// captions or motion, so linking one blank PNG saves encoding thousands.
#[tauri::command]
pub fn overlay_frame(app: AppHandle, request: tauri::ipc::Request<'_>) -> AppResult<()> {
    let header = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(str::to_string);
    let job = header("x-job").ok_or_else(|| AppError::Invalid("Missing x-job header.".into()))?;
    let index: u64 = header("x-index").and_then(|s| s.parse().ok()).ok_or_else(|| AppError::Invalid("Missing x-index header.".into()))?;
    let dir = overlay_dir(&app, &job)?;
    let blank = dir.join("blank.png");
    let target = dir.join(format!("{index:06}.png"));
    match header("x-blank").as_deref() {
        Some("use") => {
            if std::fs::hard_link(&blank, &target).is_err() {
                std::fs::copy(&blank, &target)?;
            }
        }
        mode => {
            let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
                return Err(AppError::Invalid("Frame body must be raw PNG bytes.".into()));
            };
            if !bytes.starts_with(b"\x89PNG") {
                return Err(AppError::Invalid("Frame body is not a PNG.".into()));
            }
            std::fs::write(&target, bytes)?;
            if mode == Some("set") {
                std::fs::write(&blank, bytes)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn export_start(app: AppHandle, jobs: State<'_, Jobs>, request: ExportRequest) -> AppResult<()> {
    paths::safe_id(&request.job_id)?;
    let cancel = jobs.register(&request.job_id);
    let result = exporter::run(&app, &request, cancel).await;
    jobs.finish(&request.job_id);
    if let Ok(dir) = overlay_dir(&app, &request.job_id) {
        std::fs::remove_dir_all(dir).ok();
    }
    result
}

/// Copy motion clips' Lottie files to a folder the person chose.
#[tauri::command]
pub fn export_lottie(app: AppHandle, files: Vec<(String, String)>, dest_dir: String) -> AppResult<u32> {
    let dest = PathBuf::from(dest_dir);
    if !dest.is_dir() {
        return Err(AppError::Invalid("Choose a folder to export to.".into()));
    }
    let mut n = 0;
    for (src, name) in files {
        let src = paths::ensure_inside(&app, &PathBuf::from(src))?;
        let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' }).collect();
        std::fs::copy(src, dest.join(format!("{safe}.json")))?;
        n += 1;
    }
    Ok(n)
}
