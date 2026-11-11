//! One error type for every Tauri command.
//!
//! Commands return `Result<T, AppError>`. Tauri serialises the error to the
//! frontend as `{ kind, message }`, where `message` is written for the person
//! using the app (say what happened, then what to do).

use serde::ser::SerializeStruct;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("FFmpeg was not found. Install FFmpeg, or set SPLIT_FFMPEG and SPLIT_FFPROBE to its binaries.")]
    FfmpegMissing,

    #[error("whisper.cpp was not found. Install it (for example `brew install whisper-cpp`), or set SPLIT_WHISPER to the whisper-cli binary.")]
    WhisperMissing,

    #[error("The {0} transcription model is not installed. Download it in Settings.")]
    ModelMissing(String),

    #[error("Claude is not connected. Add your API key in Settings.")]
    ClaudeNotConnected,

    #[error("{0}")]
    Claude(#[from] crate::ai::claude::ClaudeError),

    #[error("Cancelled.")]
    Cancelled,

    #[error("{0}")]
    Media(String),

    #[error("{0}")]
    Invalid(String),

    #[error("Could not access the system keychain: {0}")]
    Keychain(String),

    #[error("File error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Data error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Tauri(#[from] tauri::Error),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::FfmpegMissing => "ffmpeg_missing",
            AppError::WhisperMissing => "whisper_missing",
            AppError::ModelMissing(_) => "model_missing",
            AppError::ClaudeNotConnected => "claude_not_connected",
            AppError::Claude(e) => e.kind(),
            AppError::Cancelled => "cancelled",
            AppError::Media(_) => "media",
            AppError::Invalid(_) => "invalid",
            AppError::Keychain(_) => "keychain",
            AppError::Io(_) => "io",
            AppError::Json(_) => "json",
            AppError::Tauri(_) => "tauri",
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
