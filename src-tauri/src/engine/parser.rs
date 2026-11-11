//! Reading media properties with ffprobe: duration, frame size, frame rate, streams.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{bin, process};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub duration_ms: u64,
    pub has_video: bool,
    pub has_audio: bool,
    /// Display size, after applying any rotation metadata (phones record
    /// portrait video as landscape pixels plus a 90° rotation tag).
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps_num: Option<u32>,
    pub fps_den: Option<u32>,
}

pub async fn probe(path: &Path) -> AppResult<MediaInfo> {
    let ffprobe = bin::ffprobe()?;
    let out = process::run_capture(
        &ffprobe,
        [
            "-v".as_ref(),
            "error".as_ref(),
            "-print_format".as_ref(),
            "json".as_ref(),
            "-show_format".as_ref(),
            "-show_streams".as_ref(),
            path.as_os_str(),
        ],
        None,
    )
    .await?;
    let v: Value = serde_json::from_slice(&out)?;
    parse_probe(&v)
}

fn parse_rate(s: &str) -> Option<(u32, u32)> {
    let (n, d) = s.split_once('/')?;
    let (n, d) = (n.parse::<u32>().ok()?, d.parse::<u32>().ok()?);
    (n > 0 && d > 0).then_some((n, d))
}

fn rotation(stream: &Value) -> i64 {
    if let Some(list) = stream["side_data_list"].as_array() {
        for sd in list {
            if let Some(r) = sd["rotation"].as_i64() {
                return r;
            }
        }
    }
    stream["tags"]["rotate"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0)
}

pub fn parse_probe(v: &Value) -> AppResult<MediaInfo> {
    let streams = v["streams"].as_array().cloned().unwrap_or_default();
    // Cover art in audio files shows up as a one-frame "video" stream.
    let video = streams.iter().find(|s| {
        s["codec_type"] == "video" && s["disposition"]["attached_pic"].as_i64().unwrap_or(0) == 0
    });
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    if video.is_none() && audio.is_none() {
        return Err(AppError::Media("This file has no video or audio that Split can read.".into()));
    }

    let duration_s = v["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .or_else(|| video.and_then(|s| s["duration"].as_str()).and_then(|s| s.parse().ok()))
        .unwrap_or(0.0);
    if duration_s <= 0.0 {
        return Err(AppError::Media("Could not read how long this file is.".into()));
    }

    let (mut width, mut height, mut fps) = (None, None, None);
    if let Some(s) = video {
        let (w, h) = (s["width"].as_u64().map(|x| x as u32), s["height"].as_u64().map(|x| x as u32));
        let quarter_turn = rotation(s).rem_euclid(180) == 90;
        (width, height) = if quarter_turn { (h, w) } else { (w, h) };
        fps = s["avg_frame_rate"]
            .as_str()
            .and_then(parse_rate)
            .or_else(|| s["r_frame_rate"].as_str().and_then(parse_rate));
    }

    Ok(MediaInfo {
        duration_ms: (duration_s * 1000.0).round() as u64,
        has_video: video.is_some(),
        has_audio: audio.is_some(),
        width,
        height,
        fps_num: fps.map(|f| f.0),
        fps_den: fps.map(|f| f.1),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_portrait_phone_video() {
        let v = json!({
            "format": {"duration": "12.345"},
            "streams": [
                {"codec_type": "video", "width": 1920, "height": 1080, "avg_frame_rate": "30000/1001",
                 "side_data_list": [{"rotation": -90}]},
                {"codec_type": "audio"}
            ]
        });
        let info = parse_probe(&v).unwrap();
        assert_eq!(info.duration_ms, 12345);
        assert_eq!((info.width, info.height), (Some(1080), Some(1920)));
        assert_eq!((info.fps_num, info.fps_den), (Some(30000), Some(1001)));
        assert!(info.has_audio && info.has_video);
    }

    #[test]
    fn ignores_cover_art_in_audio_files() {
        let v = json!({
            "format": {"duration": "3.0"},
            "streams": [
                {"codec_type": "audio"},
                {"codec_type": "video", "width": 600, "height": 600, "disposition": {"attached_pic": 1}}
            ]
        });
        let info = parse_probe(&v).unwrap();
        assert!(!info.has_video);
        assert_eq!(info.width, None);
    }

    #[test]
    fn rejects_files_without_streams() {
        let v = json!({"format": {"duration": "1"}, "streams": []});
        assert!(parse_probe(&v).is_err());
    }
}
