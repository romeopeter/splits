//! End-to-end checks against the real FFmpeg on this machine.
//! Skipped (pass trivially) when FFmpeg is not installed.

use std::path::Path;
use std::process::Command;

use split_lib::engine::{bin, exporter, parser, proxy};
use split_lib::state::timeline::*;

fn ffmpeg_available() -> bool {
    bin::ffmpeg().is_ok() && bin::ffprobe().is_ok()
}

fn make_clip(dir: &Path, name: &str, size: &str, secs: u32, color_green: bool) -> String {
    let out = dir.join(name);
    let video = if color_green {
        format!("color=c=0x00FF00:s={size}:r=30:d={secs}")
    } else {
        format!("testsrc2=s={size}:r=30:d={secs}")
    };
    let status = Command::new(bin::ffmpeg().unwrap())
        .args(["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", &video, "-f", "lavfi", "-i"])
        .arg(format!("sine=frequency=440:duration={secs}"))
        .args(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"])
        .arg(&out)
        .status()
        .unwrap();
    assert!(status.success());
    out.to_string_lossy().into_owned()
}

fn write_overlay(dir: &Path, frames: u64) -> String {
    let ov = dir.join("overlay");
    std::fs::create_dir_all(&ov).unwrap();
    // A transparent 1080x1920 PNG, repeated.
    let blank = ov.join("blank.png");
    let st = Command::new(bin::ffmpeg().unwrap())
        .args(["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black@0.0:s=1080x1920,format=rgba", "-frames:v", "1"])
        .arg(&blank)
        .status()
        .unwrap();
    assert!(st.success());
    for i in 0..frames {
        std::fs::copy(&blank, ov.join(format!("{i:06}.png"))).unwrap();
    }
    ov.to_string_lossy().into_owned()
}

#[tokio::test]
async fn probe_and_export_with_chroma_key_overlay_and_mixed_audio() {
    if !ffmpeg_available() {
        eprintln!("ffmpeg not found; skipping");
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let a = make_clip(tmp.path(), "a.mp4", "1280x720", 3, false);
    let green = make_clip(tmp.path(), "green.mp4", "640x360", 2, true);

    let info = parser::probe(Path::new(&a)).await.unwrap();
    assert_eq!((info.width, info.height), (Some(1280), Some(720)));
    assert!(info.has_audio && info.has_video);
    assert!((2900..=3100).contains(&info.duration_ms));

    let out = tmp.path().join("final.mp4");
    let req = ExportRequest {
        job_id: "smoke".into(),
        target: ExportTarget::Mp4,
        output_path: out.to_string_lossy().into_owned(),
        width: 1080,
        height: 1920,
        fps_num: 30,
        fps_den: 1,
        duration_ms: 4000,
        visual: vec![
            VisualClip {
                source_path: a.clone(), source_width: 1280, source_height: 720, start_ms: 500, in_ms: 500, out_ms: 3000, speed: 1.0,
                transform: Transform::default(), crop: Crop::default(), chroma_key: None, fade_in_ms: 300, fade_out_ms: 0,
            },
            // Every per-clip filter at once: double speed (2 s of source → 1 s), crop, flip, rotation, key, opacity, fades.
            VisualClip {
                source_path: green.clone(), source_width: 640, source_height: 360, start_ms: 1000, in_ms: 0, out_ms: 2000, speed: 2.0,
                transform: Transform { x: 0.0, y: -300.0, scale: 0.5, opacity: 0.8, rotation: 15.0, flip_h: true, flip_v: false },
                crop: Crop { left: 0.1, top: 0.05, right: 0.1, bottom: 0.05 },
                chroma_key: Some(ChromaKey { color: "#00FF00".into(), similarity: 0.1, smoothness: 0.05 }),
                fade_in_ms: 200, fade_out_ms: 200,
            },
        ],
        audio: vec![
            AudioClip { source_path: a.clone(), start_ms: 500, in_ms: 500, out_ms: 3000, speed: 1.0, volume: 1.0, fade_in_ms: 0, fade_out_ms: 500 },
            AudioClip { source_path: green.clone(), start_ms: 1000, in_ms: 0, out_ms: 2000, speed: 2.0, volume: 0.5, fade_in_ms: 100, fade_out_ms: 0 },
        ],
        overlay: Some(OverlaySequence { dir: write_overlay(tmp.path(), 120), frame_count: 120 }),
    };
    let args = exporter::build_args(&req).unwrap();
    let mut last = 0.0;
    split_lib::engine::process::run_ffmpeg(&bin::ffmpeg().unwrap(), &args, req.duration_ms, None, |p| last = p)
        .await
        .unwrap();
    assert_eq!(last, 1.0);

    let result = parser::probe(&out).await.unwrap();
    assert_eq!((result.width, result.height), (Some(1080), Some(1920)));
    assert!(result.has_audio);
    assert!((3900..=4100).contains(&result.duration_ms), "duration {}", result.duration_ms);

    // Motion-only ProRes 4444 from the same overlay frames.
    let mov = tmp.path().join("motion.mov");
    let req2 = ExportRequest { target: ExportTarget::MotionMov, output_path: mov.to_string_lossy().into_owned(), ..req };
    let args2 = exporter::build_args(&req2).unwrap();
    split_lib::engine::process::run_ffmpeg(&bin::ffmpeg().unwrap(), &args2, req2.duration_ms, None, |_| {}).await.unwrap();
    assert!(mov.is_file());
}

#[tokio::test]
async fn proxy_is_720p_on_the_short_side() {
    if !ffmpeg_available() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let src = make_clip(tmp.path(), "portrait.mp4", "1080x1920", 1, false);
    let info = parser::probe(Path::new(&src)).await.unwrap();
    let out = tmp.path().join("proxy.mp4");
    let args = proxy::proxy_args(Path::new(&src), &out, &info);
    split_lib::engine::process::run_ffmpeg(&bin::ffmpeg().unwrap(), &args, info.duration_ms, None, |_| {}).await.unwrap();
    let p = parser::probe(&out).await.unwrap();
    assert_eq!((p.width, p.height), (Some(720), Some(1280)));
}
