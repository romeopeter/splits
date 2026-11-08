//! Final export: the resolved timeline becomes one FFmpeg invocation.
//!
//! Every clip is its own input, opened with `-ss <in> -t <length>` on the
//! *original* file, so FFmpeg seeks frame-accurately and decodes only what is
//! used. The `filter_complex` graph then:
//!
//! ```text
//! color(black, W×H, fps, duration) ─► overlay(clip 0) ─► overlay(clip 1) ─► … ─► overlay(PNG overlay frames) ─► [vout]
//! each audio clip: trim ─► volume ─► adelay(start) ─┐
//!                                                   └─► amix ─► pad/trim to duration ─► [aout]
//! ```
//!
//! Clip timing comes from `setpts=PTS+start/TB`: the clip's frames are stamped
//! at their timeline position, and `overlay` passes the background through
//! wherever a clip has no frame. Captions and motion arrive as a PNG sequence
//! rendered by the same canvas code the preview uses, so export matches preview.

use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::{bin, process};
use crate::error::{AppError, AppResult};
use crate::jobs::CancelRx;
use crate::state::timeline::{ExportRequest, ExportTarget, VisualClip};

fn secs(ms: u64) -> String {
    format!("{:.3}", ms as f64 / 1000.0)
}

fn even(v: f64) -> u32 {
    let v = v.round().max(2.0) as u32;
    v - (v % 2)
}

fn hex_color(c: &str) -> AppResult<String> {
    let h = c.trim().trim_start_matches('#');
    if h.len() == 6 && h.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(format!("0x{}", h.to_ascii_uppercase()))
    } else {
        Err(AppError::Invalid(format!("Chroma key colour must be #RRGGBB, got {c:?}")))
    }
}

/// Size and top-left position of a clip on the output canvas.
pub fn placement(clip: &VisualClip, w: u32, h: u32) -> (u32, u32, i64, i64) {
    let (sw, sh) = (clip.source_width.max(1) as f64, clip.source_height.max(1) as f64);
    let fit = (w as f64 / sw).min(h as f64 / sh) * clip.transform.scale.max(0.01);
    let (cw, ch) = (even(sw * fit), even(sh * fit));
    let x = ((w as f64 - cw as f64) / 2.0 + clip.transform.x).round() as i64;
    let y = ((h as f64 - ch as f64) / 2.0 + clip.transform.y).round() as i64;
    (cw, ch, x, y)
}

pub fn build_args(req: &ExportRequest) -> AppResult<Vec<String>> {
    if req.width < 2 || req.height < 2 || req.fps_num == 0 || req.fps_den == 0 || req.duration_ms == 0 {
        return Err(AppError::Invalid("The export settings are incomplete.".into()));
    }
    let fps = format!("{}/{}", req.fps_num, req.fps_den);
    let dur = secs(req.duration_ms);
    let mut args: Vec<String> = vec!["-y".into()];

    if req.target == ExportTarget::MotionMov {
        let ov = req
            .overlay
            .as_ref()
            .ok_or_else(|| AppError::Invalid("There is no motion or captions to export.".into()))?;
        let pattern = Path::new(&ov.dir).join("%06d.png");
        args.extend([
            "-framerate".into(),
            fps.clone(),
            "-i".into(),
            pattern.to_string_lossy().into_owned(),
            "-c:v".into(),
            "prores_ks".into(),
            "-profile:v".into(),
            "4444".into(),
            "-pix_fmt".into(),
            "yuva444p10le".into(),
            "-vendor".into(),
            "apl0".into(),
            "-t".into(),
            dur,
            req.output_path.clone(),
        ]);
        return Ok(args);
    }

    let mut graph: Vec<String> = Vec::new();
    let mut input = 0usize;
    graph.push(format!("color=c=black:s={}x{}:r={fps}:d={dur},format=yuv420p[base]", req.width, req.height));
    let mut prev = "base".to_string();

    for (i, clip) in req.visual.iter().enumerate() {
        if clip.out_ms <= clip.in_ms {
            continue;
        }
        args.extend([
            "-ss".into(),
            secs(clip.in_ms),
            "-t".into(),
            secs(clip.out_ms - clip.in_ms),
            "-i".into(),
            clip.source_path.clone(),
        ]);
        let (cw, ch, x, y) = placement(clip, req.width, req.height);
        let mut chain = format!("[{input}:v]setpts=PTS-STARTPTS,fps={fps},scale={cw}:{ch}:flags=lanczos,format=yuva420p");
        if let Some(k) = &clip.chroma_key {
            chain += &format!(
                ",chromakey={}:{:.4}:{:.4}",
                hex_color(&k.color)?,
                k.similarity.clamp(0.001, 1.0),
                k.smoothness.clamp(0.0, 1.0)
            );
        }
        let opacity = clip.transform.opacity.clamp(0.0, 1.0);
        if opacity < 0.999 {
            chain += &format!(",colorchannelmixer=aa={opacity:.3}");
        }
        chain += &format!(",setpts=PTS+{}/TB[v{i}]", secs(clip.start_ms));
        graph.push(chain);
        graph.push(format!("[{prev}][v{i}]overlay=x={x}:y={y}:eof_action=pass[b{i}]"));
        prev = format!("b{i}");
        input += 1;
    }

    if let Some(ov) = &req.overlay {
        let pattern = Path::new(&ov.dir).join("%06d.png");
        args.extend(["-framerate".into(), fps.clone(), "-i".into(), pattern.to_string_lossy().into_owned()]);
        graph.push(format!("[{input}:v]format=rgba,setpts=PTS-STARTPTS[ov]"));
        graph.push(format!("[{prev}][ov]overlay=0:0:eof_action=pass[bov]"));
        prev = "bov".into();
        input += 1;
    }
    graph.push(format!("[{prev}]format=yuv420p[vout]"));

    let mut audio_labels = Vec::new();
    for (j, a) in req.audio.iter().enumerate() {
        if a.out_ms <= a.in_ms {
            continue;
        }
        args.extend([
            "-ss".into(),
            secs(a.in_ms),
            "-t".into(),
            secs(a.out_ms - a.in_ms),
            "-i".into(),
            a.source_path.clone(),
        ]);
        graph.push(format!(
            "[{input}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume={:.3},adelay={}:all=1[a{j}]",
            a.volume.clamp(0.0, 2.0),
            a.start_ms
        ));
        audio_labels.push(format!("[a{j}]"));
        input += 1;
    }
    match audio_labels.len() {
        0 => graph.push(format!("anullsrc=r=48000:cl=stereo,atrim=0:{dur}[aout]")),
        1 => graph.push(format!("{}apad,atrim=0:{dur}[aout]", audio_labels[0])),
        n => graph.push(format!(
            "{}amix=inputs={n}:normalize=0:dropout_transition=0,apad,atrim=0:{dur}[aout]",
            audio_labels.join("")
        )),
    }

    args.extend([
        "-filter_complex".into(),
        graph.join(";"),
        "-map".into(),
        "[vout]".into(),
        "-map".into(),
        "[aout]".into(),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "medium".into(),
        "-crf".into(),
        "18".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-r".into(),
        fps,
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "192k".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-t".into(),
        dur,
        req.output_path.clone(),
    ]);
    Ok(args)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportEvent<'a> {
    job_id: &'a str,
    progress: f64,
}

pub async fn run(app: &AppHandle, req: &ExportRequest, cancel: CancelRx) -> AppResult<()> {
    let ffmpeg = bin::ffmpeg()?;
    let args = build_args(req)?;
    tracing::info!(job = %req.job_id, inputs = req.visual.len() + req.audio.len(), "export started");
    let app2 = app.clone();
    let job = req.job_id.clone();
    let mut last = -1.0;
    let result = process::run_ffmpeg(&ffmpeg, &args, req.duration_ms, Some(cancel), move |p| {
        if p - last >= 0.005 {
            last = p;
            let _ = app2.emit("export-progress", ExportEvent { job_id: &job, progress: p });
        }
    })
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&req.output_path).await;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::timeline::*;

    fn req() -> ExportRequest {
        ExportRequest {
            job_id: "j1".into(),
            target: ExportTarget::Mp4,
            output_path: "/out/final.mp4".into(),
            width: 1080,
            height: 1920,
            fps_num: 30,
            fps_den: 1,
            duration_ms: 10_000,
            visual: vec![VisualClip {
                source_path: "/media/a.mov".into(),
                source_width: 1920,
                source_height: 1080,
                start_ms: 2000,
                in_ms: 1000,
                out_ms: 6000,
                transform: Transform::default(),
                chroma_key: Some(ChromaKey { color: "#00ff00".into(), similarity: 0.12, smoothness: 0.08 }),
            }],
            audio: vec![
                AudioClip { source_path: "/media/a.mov".into(), start_ms: 2000, in_ms: 1000, out_ms: 6000, volume: 1.0 },
                AudioClip { source_path: "/media/music.mp3".into(), start_ms: 0, in_ms: 0, out_ms: 10_000, volume: 0.5 },
            ],
            overlay: Some(OverlaySequence { dir: "/tmp/ov".into(), frame_count: 300 }),
        }
    }

    #[test]
    fn builds_a_layered_graph_from_original_sources() {
        let args = build_args(&req()).unwrap();
        let joined = args.join(" ");
        assert!(joined.contains("-ss 1.000 -t 5.000 -i /media/a.mov"));
        let graph = &args[args.iter().position(|a| a == "-filter_complex").unwrap() + 1];
        assert!(graph.contains("color=c=black:s=1080x1920:r=30/1:d=10.000"));
        assert!(graph.contains("chromakey=0x00FF00:0.1200:0.0800"));
        assert!(graph.contains("setpts=PTS+2.000/TB[v0]"));
        assert!(graph.contains("[base][v0]overlay=x=0:y=656:eof_action=pass[b0]"));
        // Inputs: 0 = visual clip, 1 = overlay frames, 2 and 3 = audio clips.
        assert!(graph.contains("[1:v]format=rgba"), "{graph}");
        assert!(graph.contains("[2:a]") && graph.contains("[3:a]"), "{graph}");
        assert!(graph.contains("amix=inputs=2:normalize=0"));
        assert!(graph.contains("adelay=2000:all=1"));
        assert!(graph.ends_with("[aout]"));
        assert_eq!(args.last().unwrap(), "/out/final.mp4");
    }

    #[test]
    fn fits_landscape_into_portrait() {
        let r = req();
        let (w, h, x, y) = placement(&r.visual[0], 1080, 1920);
        assert_eq!((w, h, x, y), (1080, 608, 0, 656));
    }

    #[test]
    fn motion_only_needs_overlay() {
        let mut r = req();
        r.target = ExportTarget::MotionMov;
        assert!(build_args(&r).unwrap().contains(&"prores_ks".to_string()));
        r.overlay = None;
        assert!(build_args(&r).is_err());
    }

    #[test]
    fn rejects_bad_key_colour() {
        let mut r = req();
        r.visual[0].chroma_key.as_mut().unwrap().color = "green".into();
        assert!(build_args(&r).is_err());
    }
}
