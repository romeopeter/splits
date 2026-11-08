//! Transcript-driven motion through the Claude API.
//!
//! The only module (with `engine::models` downloads) allowed to use the network.
//! It sends transcript text, word timings, canvas size, frame rate and the
//! style prompt. Never audio, video, frames or file paths.

pub mod claude;
pub mod motion;
pub mod sse;
pub mod validate;
