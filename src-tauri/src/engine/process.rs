//! Running FFmpeg (and friends) as child processes with progress and cancellation.
//!
//! FFmpeg reports progress on stdout when run with `-progress pipe:1 -nostats`:
//! blocks of `key=value` lines, including `out_time_us=<microseconds>` and
//! `progress=continue|end`. We turn `out_time_us` into a 0..1 fraction of the
//! expected output duration.

use std::ffi::OsStr;
use std::path::Path;
use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;

use crate::error::{AppError, AppResult};
use crate::jobs::{cancelled, CancelRx};

/// Parse one `-progress` line. Returns the output time in milliseconds.
pub fn parse_progress_line(line: &str) -> Option<u64> {
    let (key, value) = line.trim().split_once('=')?;
    match key {
        // `out_time_ms` is also microseconds, despite its name.
        "out_time_us" | "out_time_ms" => value.parse::<i64>().ok().filter(|v| *v >= 0).map(|us| (us / 1000) as u64),
        _ => None,
    }
}

fn tail(s: &str, max: usize) -> String {
    let lines: Vec<&str> = s.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(max);
    lines[start..].join("\n")
}

/// Run FFmpeg with progress reporting. `total_ms` is the expected output length.
pub async fn run_ffmpeg<I, S>(
    ffmpeg: &Path,
    args: I,
    total_ms: u64,
    mut cancel: Option<CancelRx>,
    mut on_progress: impl FnMut(f64) + Send,
) -> AppResult<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut child = Command::new(ffmpeg)
        .args(["-hide_banner", "-nostdin", "-progress", "pipe:1", "-nostats"])
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    let stdout = child.stdout.take().expect("piped stdout");
    let mut stderr = child.stderr.take().expect("piped stderr");
    let err_task = tokio::spawn(async move {
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf).await;
        buf
    });

    let mut lines = BufReader::new(stdout).lines();
    let work = async {
        while let Some(line) = lines.next_line().await? {
            if let Some(ms) = parse_progress_line(&line) {
                if total_ms > 0 {
                    on_progress((ms as f64 / total_ms as f64).clamp(0.0, 1.0));
                }
            }
        }
        child.wait().await
    };

    let status = match cancel.as_mut() {
        Some(rx) => {
            tokio::select! {
                s = work => s?,
                _ = cancelled(rx) => return Err(AppError::Cancelled),
            }
        }
        None => work.await?,
    };

    let stderr_text = err_task.await.unwrap_or_default();
    if status.success() {
        on_progress(1.0);
        Ok(())
    } else {
        tracing::warn!(%status, stderr = %tail(&stderr_text, 30), "ffmpeg failed");
        Err(AppError::Media(format!(
            "FFmpeg could not process this media.\n{}",
            tail(&stderr_text, 6)
        )))
    }
}

/// Run a command to completion and return stdout. Used for ffprobe and whisper.
pub async fn run_capture<I, S>(program: &Path, args: I, mut cancel: Option<CancelRx>) -> AppResult<Vec<u8>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let out = match cancel.as_mut() {
        Some(rx) => tokio::select! {
            o = child.wait_with_output() => o?,
            _ = cancelled(rx) => return Err(AppError::Cancelled),
        },
        None => child.wait_with_output().await?,
    };
    if out.status.success() {
        Ok(out.stdout)
    } else {
        let name = program.file_name().and_then(|n| n.to_str()).unwrap_or("process");
        Err(AppError::Media(format!(
            "{name} failed.\n{}",
            tail(&String::from_utf8_lossy(&out.stderr), 6)
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_progress_microseconds() {
        assert_eq!(parse_progress_line("out_time_us=1500000"), Some(1500));
        assert_eq!(parse_progress_line("out_time_ms=2000000"), Some(2000));
        assert_eq!(parse_progress_line("out_time_us=N/A"), None);
        assert_eq!(parse_progress_line("out_time_us=-5"), None);
        assert_eq!(parse_progress_line("progress=end"), None);
    }
}
