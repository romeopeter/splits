//! Final export: the resolved timeline becomes one FFmpeg invocation.
//!
//! Every clip is its own input, opened with `-ss <in> -t <length>` on the
//! *original* file, so FFmpeg seeks frame-accurately and decodes only what is
//! used. The `filter_complex` graph then:
//!
//! ```text
//! color(black, W×H, fps, duration) ─► overlay(clip 0) ─► overlay(clip 1) ─► … ─► overlay(PNG overlay frames) ─► [vout]
//! each video clip: speed ─► crop ─► flip ─► scale ─► key ─► opacity ─► fades ─► rotate ─► stamp at start
//! each audio clip: speed (atempo) ─► volume ─► fades ─► adelay(start) ─┐
//!                                                                      └─► amix ─► pad/trim to duration ─► [aout]
//! ```
//!
//! Clip timing comes from `setpts=PTS+start/TB`: the clip's frames are stamped
//! at their timeline position, and `overlay` passes the background through
//! wherever a clip has no frame. Speed divides the clip's own timestamps first
//! (`setpts=(PTS-STARTPTS)/speed`), so fades are measured on the timeline.
//! The preview's compositor applies crop, flip, rotation and fades in the same
//! order (src/lib/compositor.ts). Captions and motion arrive as a PNG sequence
//! rendered by the same canvas code the preview uses, so export matches preview.

use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::{bin, process};
use crate::error::{AppError, AppResult};
use crate::jobs::CancelRx;
use crate::state::timeline::{Crop, ExportRequest, ExportTarget, VisualClip};

const MIN_SPEED: f64 = 0.25;
const MAX_SPEED: f64 = 4.0;
/// Largest share of the picture one crop edge may remove (matches `MAX_CROP` in the frontend).
const MAX_CROP: f64 = 0.9;

fn secs(ms: u64) -> String {
    format!("{:.3}", ms as f64 / 1000.0)
}

fn checked_speed(speed: f64) -> AppResult<f64> {
    if speed.is_finite() && (MIN_SPEED - 1e-9..=MAX_SPEED + 1e-9).contains(&speed) {
        Ok(speed)
    } else {
        Err(AppError::Invalid(format!("Clip speed must be between 0.25x and 4x, got {speed}.")))
    }
}

/// Timeline length of a source range played at `speed` (same rounding as `clipLength` in the frontend).
fn timeline_ms(in_ms: u64, out_ms: u64, speed: f64) -> u64 {
    (out_ms.saturating_sub(in_ms) as f64 / speed).round() as u64
}

/// `atempo` factors whose product is `speed`, each inside 0.5..=2.0, the range every FFmpeg version accepts.
fn atempo_chain(speed: f64) -> Vec<f64> {
    let mut rest = speed;
    let mut out = Vec::new();
    while rest > 2.0 + 1e-9 {
        out.push(2.0);
        rest /= 2.0;
    }
    while rest < 0.5 - 1e-9 {
        out.push(0.5);
        rest /= 0.5;
    }
    if (rest - 1.0).abs() > 1e-6 {
        out.push(rest);
    }
    out
}

fn checked_crop(c: &Crop) -> AppResult<&Crop> {
    let edges = [c.left, c.top, c.right, c.bottom];
    let ok = edges.iter().all(|e| e.is_finite() && (0.0..=MAX_CROP).contains(e))
        && c.left + c.right <= MAX_CROP + 1e-9
        && c.top + c.bottom <= MAX_CROP + 1e-9;
    if ok {
        Ok(c)
    } else {
        Err(AppError::Invalid("A clip's crop is out of range.".into()))
    }
}

/// Source pixels left after cropping: (width, height, x, y).
fn crop_rect(clip: &VisualClip) -> (u32, u32, u32, u32) {
    let (sw, sh) = (clip.source_width.max(1) as f64, clip.source_height.max(1) as f64);
    let c = &clip.crop;
    let w = (sw * (1.0 - c.left - c.right)).round().max(2.0) as u32;
    let h = (sh * (1.0 - c.top - c.bottom)).round().max(2.0) as u32;
    (w, h, (sw * c.left).round() as u32, (sh * c.top).round() as u32)
}

/// Rotation in degrees folded into -180..180, or None when there is effectively none.
fn rotation(clip: &VisualClip) -> AppResult<Option<f64>> {
    let r = clip.transform.rotation;
    if !r.is_finite() {
        return Err(AppError::Invalid("A clip's rotation is not a number.".into()));
    }
    let folded = (r + 180.0).rem_euclid(360.0) - 180.0;
    Ok((folded.abs() > 0.01).then_some(folded))
}

/// Bounding box of a `w`×`h` picture turned by `deg`, rounded up to even sizes for yuv420.
fn rotated_size(w: u32, h: u32, deg: f64) -> (u32, u32) {
    let (s, c) = deg.to_radians().sin_cos();
    let bw = (w as f64 * c.abs() + h as f64 * s.abs()).ceil();
    let bh = (w as f64 * s.abs() + h as f64 * c.abs()).ceil();
    let up = |v: f64| {
        let v = v.max(2.0) as u32;
        v + (v % 2)
    };
    (up(bw), up(bh))
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

/// Size and top-left position of a clip on the output canvas, before rotation.
pub fn placement(clip: &VisualClip, w: u32, h: u32) -> (u32, u32, i64, i64) {
    let (cw, ch, _, _) = crop_rect(clip);
    let (sw, sh) = (cw as f64, ch as f64);
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
        let speed = checked_speed(clip.speed)?;
        checked_crop(&clip.crop)?;
        args.extend([
            "-ss".into(),
            secs(clip.in_ms),
            "-t".into(),
            secs(clip.out_ms - clip.in_ms),
            "-i".into(),
            clip.source_path.clone(),
        ]);
        let (cw, ch, x, y) = placement(clip, req.width, req.height);
        let mut chain = if (speed - 1.0).abs() > 1e-6 {
            format!("[{input}:v]setpts=(PTS-STARTPTS)/{speed:.4},fps={fps}")
        } else {
            format!("[{input}:v]setpts=PTS-STARTPTS,fps={fps}")
        };
        if clip.crop != Crop::default() {
            let (w, h, cx, cy) = crop_rect(clip);
            chain += &format!(",crop={w}:{h}:{cx}:{cy}");
        }
        if clip.transform.flip_h {
            chain += ",hflip";
        }
        if clip.transform.flip_v {
            chain += ",vflip";
        }
        chain += &format!(",scale={cw}:{ch}:flags=lanczos,format=yuva420p");
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
        let len = timeline_ms(clip.in_ms, clip.out_ms, speed);
        if clip.fade_in_ms > 0 {
            chain += &format!(",fade=t=in:st=0:d={}:alpha=1", secs(clip.fade_in_ms.min(len)));
        }
        if clip.fade_out_ms > 0 {
            let d = clip.fade_out_ms.min(len);
            chain += &format!(",fade=t=out:st={}:d={}:alpha=1", secs(len - d), secs(d));
        }
        // Rotation grows the frame to the turned picture's bounding box; shift so the centre stays put.
        let (mut ox, mut oy) = (x, y);
        if let Some(deg) = rotation(clip)? {
            let (rw, rh) = rotated_size(cw, ch, deg);
            chain += &format!(",rotate={:.6}:ow={rw}:oh={rh}:c=black@0", deg.to_radians());
            ox += (cw as i64 - rw as i64) / 2;
            oy += (ch as i64 - rh as i64) / 2;
        }
        chain += &format!(",setpts=PTS+{}/TB[v{i}]", secs(clip.start_ms));
        graph.push(chain);
        graph.push(format!("[{prev}][v{i}]overlay=x={ox}:y={oy}:eof_action=pass[b{i}]"));
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
        let speed = checked_speed(a.speed)?;
        args.extend([
            "-ss".into(),
            secs(a.in_ms),
            "-t".into(),
            secs(a.out_ms - a.in_ms),
            "-i".into(),
            a.source_path.clone(),
        ]);
        let mut chain = format!("[{input}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo");
        for f in atempo_chain(speed) {
            chain += &format!(",atempo={f:.6}");
        }
        chain += &format!(",volume={:.3}", a.volume.clamp(0.0, 2.0));
        let len = timeline_ms(a.in_ms, a.out_ms, speed);
        if a.fade_in_ms > 0 {
            chain += &format!(",afade=t=in:st=0:d={}", secs(a.fade_in_ms.min(len)));
        }
        if a.fade_out_ms > 0 {
            let d = a.fade_out_ms.min(len);
            chain += &format!(",afade=t=out:st={}:d={}", secs(len - d), secs(d));
        }
        chain += &format!(",adelay={}:all=1[a{j}]", a.start_ms);
        graph.push(chain);
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

    fn audio(path: &str, start_ms: u64, in_ms: u64, out_ms: u64, volume: f64) -> AudioClip {
        AudioClip { source_path: path.into(), start_ms, in_ms, out_ms, speed: 1.0, volume, fade_in_ms: 0, fade_out_ms: 0 }
    }

    fn graph(r: &ExportRequest) -> String {
        let args = build_args(r).unwrap();
        args[args.iter().position(|a| a == "-filter_complex").unwrap() + 1].clone()
    }

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
                speed: 1.0,
                transform: Transform::default(),
                crop: Crop::default(),
                chroma_key: Some(ChromaKey { color: "#00ff00".into(), similarity: 0.12, smoothness: 0.08 }),
                fade_in_ms: 0,
                fade_out_ms: 0,
            }],
            audio: vec![
                audio("/media/a.mov", 2000, 1000, 6000, 1.0),
                audio("/media/music.mp3", 0, 0, 10_000, 0.5),
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
    fn speed_retimes_picture_and_sound() {
        let mut r = req();
        r.visual[0].speed = 2.0;
        r.audio[0].speed = 0.25;
        let g = graph(&r);
        assert!(g.contains("[0:v]setpts=(PTS-STARTPTS)/2.0000,fps=30/1"), "{g}");
        assert!(g.contains("atempo=0.500000,atempo=0.500000,volume=1.000"), "{g}");
        // The source range is unchanged; speed only changes how long it lasts on the timeline.
        assert!(build_args(&r).unwrap().join(" ").contains("-ss 1.000 -t 5.000 -i /media/a.mov"));
    }

    #[test]
    fn atempo_stays_in_range() {
        assert_eq!(atempo_chain(1.0), Vec::<f64>::new());
        assert_eq!(atempo_chain(4.0), vec![2.0, 2.0]);
        assert_eq!(atempo_chain(3.0), vec![2.0, 1.5]);
        assert_eq!(atempo_chain(0.25), vec![0.5, 0.5]);
    }

    #[test]
    fn rejects_out_of_range_speed() {
        let mut r = req();
        r.visual[0].speed = 8.0;
        assert!(build_args(&r).is_err());
        let mut r = req();
        r.audio[1].speed = f64::NAN;
        assert!(build_args(&r).is_err());
    }

    #[test]
    fn crop_flip_and_rotate_in_order() {
        let mut r = req();
        r.visual[0].chroma_key = None;
        r.visual[0].crop = Crop { left: 0.25, top: 0.0, right: 0.25, bottom: 0.0 };
        r.visual[0].transform.flip_h = true;
        r.visual[0].transform.rotation = 90.0;
        let g = graph(&r);
        // 1920×1080 cropped to the middle half: 960×1080, fitted into 1080×1920 → 1080×1214.
        let i = |needle: &str| g.find(needle).unwrap_or_else(|| panic!("{needle} missing from {g}"));
        assert!(i("crop=960:1080:480:0") < i("hflip") && i("hflip") < i("scale=1080:1214") && i("scale=1080:1214") < i("rotate=1.570796:ow=1214:oh=1080:c=black@0"));
        // The turned 1214×1080 box keeps the centre: x = 0 + (1080 - 1214) / 2, y = 353 + (1214 - 1080) / 2.
        assert!(g.contains("overlay=x=-67:y=420"), "{g}");
    }

    #[test]
    fn rejects_bad_crop() {
        let mut r = req();
        r.visual[0].crop = Crop { left: 0.6, top: 0.0, right: 0.6, bottom: 0.0 };
        assert!(build_args(&r).is_err());
    }

    #[test]
    fn fades_are_measured_on_the_timeline() {
        let mut r = req();
        r.visual[0].speed = 2.0; // 5 s of source → 2.5 s on the timeline
        r.visual[0].fade_in_ms = 500;
        r.visual[0].fade_out_ms = 1000;
        r.audio[0].fade_out_ms = 750;
        let g = graph(&r);
        assert!(g.contains("fade=t=in:st=0:d=0.500:alpha=1,fade=t=out:st=1.500:d=1.000:alpha=1"), "{g}");
        assert!(g.contains("afade=t=out:st=4.250:d=0.750,adelay=2000"), "{g}");
    }

    #[test]
    fn rejects_bad_key_colour() {
        let mut r = req();
        r.visual[0].chroma_key.as_mut().unwrap().color = "green".into();
        assert!(build_args(&r).is_err());
    }
}
