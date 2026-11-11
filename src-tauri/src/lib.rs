//! Split: a local-first desktop video editor.
//!
//! Rust owns everything heavy or sensitive: media processing (FFmpeg),
//! transcription (whisper.cpp), the Claude API key and requests, and export.
//! The React app owns the editable project and the UI.

pub mod ai;
pub mod commands;
pub mod engine;
pub mod error;
pub mod jobs;
pub mod paths;
pub mod secrets;
pub mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_env("SPLIT_LOG").unwrap_or_else(|_| "split_lib=info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(jobs::Jobs::default())
        .invoke_handler(tauri::generate_handler![
            commands::import_media,
            commands::ensure_media,
            commands::whisper_status,
            commands::transcribe_asset,
            commands::download_model,
            commands::cancel_job,
            commands::claude_key_set,
            commands::claude_key_status,
            commands::claude_key_delete,
            commands::claude_test,
            commands::motion_generate,
            commands::read_app_file,
            commands::project_save,
            commands::project_load_last,
            commands::project_load,
            commands::project_list,
            commands::overlay_begin,
            commands::overlay_frame,
            commands::export_start,
            commands::export_lottie,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Split");
}
