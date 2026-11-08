//! Minimal Claude Messages API client over raw HTTPS (there is no official Rust SDK).
//!
//! - Streaming SSE, because Lottie replies are long.
//! - Adaptive thinking with an explicit effort level.
//! - Server-side refusal fallback (`fallbacks: "default"`) on models that support it.
//! - The fixed system prompt carries `cache_control`, so repeat batches reuse it.
//! - Retries on 429 / 5xx / overloaded, honouring `retry-after`.
//!
//! The API key is passed in by the caller (read from the keychain in Rust) and
//! never leaves this process except in the `x-api-key` header.

use std::time::Duration;

use futures_util::StreamExt;
use serde_json::{json, Value};

use super::sse::{SseState, Usage};
use crate::error::{AppError, AppResult};
use crate::jobs::{cancelled, CancelRx};

pub const MESSAGES_URL: &str = "https://api.anthropic.com/v1/messages";
pub const MODELS_URL: &str = "https://api.anthropic.com/v1/models?limit=1";
pub const API_VERSION: &str = "2026-10-21";
pub const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
pub const DEFAULT_MODEL: &str = "claude-opus-5-5";
pub const MODELS: &[&str] = &["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
pub const EFFORTS: &[&str] = &["low", "medium", "high", "xhigh", "max"];
const MAX_RETRIES: u32 = 2;

#[derive(Debug, thiserror::Error)]
pub enum ClaudeError {
    #[error("Claude key rejected. Check it in Settings.")]
    InvalidKey,
    #[error("This Claude key cannot use that model or feature. ({0})")]
    Forbidden(String),
    #[error("Claude is busy right now. Try again in a moment.")]
    Busy,
    #[error("Motion needs an internet connection. ({0})")]
    Network(String),
    #[error("Claude declined to animate this text. Try a different style prompt.")]
    Refusal,
    #[error("Claude returned an error: {0}")]
    Api(String),
}

impl ClaudeError {
    pub fn kind(&self) -> &'static str {
        match self {
            ClaudeError::InvalidKey => "claude_invalid_key",
            ClaudeError::Forbidden(_) => "claude_forbidden",
            ClaudeError::Busy => "claude_busy",
            ClaudeError::Network(_) => "claude_network",
            ClaudeError::Refusal => "claude_refusal",
            ClaudeError::Api(_) => "claude_api",
        }
    }
    fn retryable(&self) -> bool {
        matches!(self, ClaudeError::Busy | ClaudeError::Network(_))
    }
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(180))
        .user_agent(concat!("Splits/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("http client")
}

pub struct Request<'a> {
    pub model: &'a str,
    pub effort: &'a str,
    pub max_tokens: u32,
    pub system: &'a str,
    pub user: String,
}

#[derive(Debug)]
pub struct Reply {
    pub text: String,
    pub stop_reason: Option<String>,
    pub usage: Usage,
}

pub fn supports_fallback(model: &str) -> bool {
    matches!(model, "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-opus-5" | "claude-fable-5-1")
}

pub fn body(req: &Request) -> Value {
    let mut b = json!({
        "model": req.model,
        "max_tokens": req.max_tokens,
        "stream": true,
        "thinking": { "type": "adaptive" },
        "output_config": { "effort": req.effort },
        "system": [{ "type": "text", "text": req.system, "cache_control": { "type": "ephemeral" } }],
        "messages": [{ "role": "user", "content": req.user }],
    });
    if supports_fallback(req.model) {
        b["fallbacks"] = json!("default");
    }
    b
}

fn status_error(status: reqwest::StatusCode, body: &str) -> ClaudeError {
    let msg = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(String::from))
        .unwrap_or_else(|| status.to_string());
    match status.as_u16() {
        401 => ClaudeError::InvalidKey,
        403 | 404 => ClaudeError::Forbidden(msg),
        429 | 500 | 502 | 503 | 504 | 529 => ClaudeError::Busy,
        _ => ClaudeError::Api(msg),
    }
}

fn retry_delay(headers: &reqwest::header::HeaderMap, attempt: u32) -> Duration {
    headers
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .map(|s| Duration::from_secs(s.min(60)))
        .unwrap_or_else(|| Duration::from_secs(2u64.pow(attempt + 1)))
}

async fn attempt(
    http: &reqwest::Client,
    key: &str,
    req: &Request<'_>,
    on_chars: &mut (dyn FnMut(usize) + Send),
) -> Result<Reply, (ClaudeError, Duration)> {
    let mut rb = http
        .post(MESSAGES_URL)
        .header("x-api-key", key)
        .header("anthropic-version", API_VERSION)
        .header("content-type", "application/json")
        .json(&body(req));
    if supports_fallback(req.model) {
        rb = rb.header("anthropic-beta", FALLBACK_BETA);
    }
    let resp = rb.send().await.map_err(|e| (ClaudeError::Network(e.to_string()), Duration::from_secs(2)))?;
    let status = resp.status();
    if !status.is_success() {
        let delay = retry_delay(resp.headers(), 0);
        let text = resp.text().await.unwrap_or_default();
        return Err((status_error(status, &text), delay));
    }

    let mut sse = SseState::default();
    let mut carry = Vec::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| (ClaudeError::Network(e.to_string()), Duration::from_secs(2)))?;
        let added = sse.feed_bytes(&mut carry, &chunk);
        if added > 0 {
            on_chars(sse.text.len());
        }
        if let Some((kind, message)) = &sse.error {
            let err = if kind == "overloaded_error" || kind == "rate_limit_error" || kind == "api_error" {
                ClaudeError::Busy
            } else {
                ClaudeError::Api(message.clone())
            };
            return Err((err, Duration::from_secs(4)));
        }
    }
    if sse.stop_reason.as_deref() == Some("refusal") {
        return Err((ClaudeError::Refusal, Duration::ZERO));
    }
    Ok(Reply { text: sse.text, stop_reason: sse.stop_reason, usage: sse.usage })
}

/// Send one streaming request, retrying transient failures. Cancellable.
pub async fn send(
    http: &reqwest::Client,
    key: &str,
    req: &Request<'_>,
    cancel: &mut CancelRx,
    mut on_chars: impl FnMut(usize) + Send,
) -> AppResult<Reply> {
    let mut tries = 0;
    loop {
        let result = tokio::select! {
            r = attempt(http, key, req, &mut on_chars) => r,
            _ = cancelled(cancel) => return Err(AppError::Cancelled),
        };
        match result {
            Ok(reply) => return Ok(reply),
            Err((e, delay)) if e.retryable() && tries < MAX_RETRIES => {
                tries += 1;
                tracing::info!(error = %e, ?delay, tries, "retrying Claude request");
                tokio::select! {
                    _ = tokio::time::sleep(delay) => {},
                    _ = cancelled(cancel) => return Err(AppError::Cancelled),
                }
            }
            Err((e, _)) => return Err(e.into()),
        }
    }
}

/// Check a key without spending tokens: list one model.
pub async fn test_key(http: &reqwest::Client, key: &str) -> AppResult<()> {
    let resp = http
        .get(MODELS_URL)
        .header("x-api-key", key)
        .header("anthropic-version", API_VERSION)
        .send()
        .await
        .map_err(|e| ClaudeError::Network(e.to_string()))?;
    let status = resp.status();
    if status.is_success() {
        Ok(())
    } else {
        let text = resp.text().await.unwrap_or_default();
        Err(status_error(status, &text).into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_has_streaming_caching_thinking_and_fallback() {
        let b = body(&Request { model: DEFAULT_MODEL, effort: "high", max_tokens: 64000, system: "S", user: "U".into() });
        assert_eq!(b["stream"], true);
        assert_eq!(b["thinking"]["type"], "adaptive");
        assert_eq!(b["output_config"]["effort"], "high");
        assert_eq!(b["system"][0]["cache_control"]["type"], "ephemeral");
        assert_eq!(b["fallbacks"], "default");
        assert!(b.get("temperature").is_none());
    }

    #[test]
    fn haiku_requests_omit_fallbacks() {
        let b = body(&Request { model: "claude-haiku-5-5", effort: "low", max_tokens: 100, system: "S", user: "U".into() });
        assert!(b.get("fallbacks").is_none());
    }

    #[test]
    fn maps_statuses_to_friendly_errors() {
        use reqwest::StatusCode;
        assert!(matches!(status_error(StatusCode::UNAUTHORIZED, ""), ClaudeError::InvalidKey));
        assert!(matches!(status_error(StatusCode::TOO_MANY_REQUESTS, ""), ClaudeError::Busy));
        assert!(matches!(status_error(StatusCode::from_u16(529).unwrap(), ""), ClaudeError::Busy));
        match status_error(StatusCode::BAD_REQUEST, r#"{"error":{"message":"bad field"}}"#) {
            ClaudeError::Api(m) => assert_eq!(m, "bad field"),
            other => panic!("{other:?}"),
        }
    }
}
