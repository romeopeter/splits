/**
 * WebGL compositor for the preview's video layers.
 *
 * Each visible video clip is drawn as a textured quad, bottom layer first,
 * placed exactly as the exporter places it (fit inside the canvas, times the
 * clip's scale, offset from centre). The fragment shader applies the chroma
 * key with the same maths as FFmpeg's `chromakey` filter, so the preview
 * shows what export will produce:
 *
 *   diff  = sqrt((Δcb² + Δcr²) / 2)                 (BT.601 chroma, 0..1)
 *   alpha = smoothness > 0 ? clamp((diff − similarity) / smoothness, 0, 1)
 *                          : diff > similarity ? 1 : 0
 */
import type { ChromaKey, Transform } from "../types/project";

const VERT = `
attribute vec2 a_pos;
uniform vec4 u_rect;      // x, y, w, h in project pixels
uniform vec2 u_project;   // project width, height
varying vec2 v_uv;
void main() {
  vec2 p = u_rect.xy + a_pos * u_rect.zw;
  vec2 ndc = vec2(p.x / u_project.x * 2.0 - 1.0, 1.0 - p.y / u_project.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_uv = a_pos;
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_opacity;
uniform bool u_key;
uniform vec2 u_keyUV;
uniform float u_similarity;
uniform float u_smoothness;
varying vec2 v_uv;
vec2 chroma(vec3 c) {
  return vec2(-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b + 0.5,
               0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b + 0.5);
}
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  float a = 1.0;
  if (u_key) {
    vec2 d = chroma(c.rgb) - u_keyUV;
    float diff = sqrt((d.x * d.x + d.y * d.y) / 2.0);
    a = u_smoothness > 0.0001 ? clamp((diff - u_similarity) / u_smoothness, 0.0, 1.0) : (diff > u_similarity ? 1.0 : 0.0);
  }
  gl_FragColor = vec4(c.rgb, a * u_opacity);
}`;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 6 ? h : "00ff00", 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function keyUV(hex: string): [number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [-0.168736 * r - 0.331264 * g + 0.5 * b + 0.5, 0.5 * r - 0.418688 * g - 0.081312 * b + 0.5];
}

/** Same placement as `exporter::placement` in Rust. */
export function placeRect(srcW: number, srcH: number, t: Transform, W: number, H: number) {
  const fit = Math.min(W / Math.max(1, srcW), H / Math.max(1, srcH)) * Math.max(0.01, t.scale);
  const even = (v: number) => {
    const r = Math.max(2, Math.round(v));
    return r - (r % 2);
  };
  const w = even(srcW * fit);
  const h = even(srcH * fit);
  return { x: Math.round((W - w) / 2 + t.x), y: Math.round((H - h) / 2 + t.y), w, h };
}

export class Compositor {
  private gl: WebGLRenderingContext;
  private tex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: false, antialias: false });
    if (!gl) throw new Error("WebGL is not available, so the preview cannot draw video.");
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
    gl.useProgram(prog);
    for (const n of ["u_rect", "u_project", "u_tex", "u_opacity", "u_key", "u_keyUV", "u_similarity", "u_smoothness"]) {
      this.loc[n] = gl.getUniformLocation(prog, n);
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  begin(projectW: number, projectH: number) {
    const { gl, canvas } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(this.loc.u_project!, projectW, projectH);
  }

  draw(source: TexImageSource, srcW: number, srcH: number, t: Transform, key: ChromaKey | null, W: number, H: number) {
    const { gl } = this;
    const r = placeRect(srcW, srcH, t, W, H);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    } catch {
      return; // frame not decodable yet
    }
    gl.uniform4f(this.loc.u_rect!, r.x, r.y, r.w, r.h);
    gl.uniform1f(this.loc.u_opacity!, Math.min(1, Math.max(0, t.opacity)));
    gl.uniform1i(this.loc.u_key!, key?.enabled ? 1 : 0);
    if (key?.enabled) {
      const [u, v] = keyUV(key.color);
      gl.uniform2f(this.loc.u_keyUV!, u, v);
      gl.uniform1f(this.loc.u_similarity!, Math.max(0.001, key.similarity));
      gl.uniform1f(this.loc.u_smoothness!, Math.max(0, key.smoothness));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
