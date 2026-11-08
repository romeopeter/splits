//! Incremental parser for the Messages API's server-sent events.
//!
//! Bytes arrive in arbitrary chunks. Events are separated by a blank line; each
//! carries one `data: {json}` line. We keep only what the motion feature needs:
//! the text of `text` blocks (thinking and other block types are skipped), the
//! stop reason, usage, and any `error` event.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Default, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cache_creation_input_tokens: u64,
}

impl Usage {
    pub fn add(&mut self, o: &Usage) {
        self.input_tokens += o.input_tokens;
        self.output_tokens += o.output_tokens;
        self.cache_read_input_tokens += o.cache_read_input_tokens;
        self.cache_creation_input_tokens += o.cache_creation_input_tokens;
    }
}

#[derive(Debug, Default)]
pub struct SseState {
    buf: String,
    text_blocks: Vec<usize>,
    pub text: String,
    pub stop_reason: Option<String>,
    pub model: Option<String>,
    pub usage: Usage,
    pub error: Option<(String, String)>,
}

fn read_usage(u: &Value, into: &mut Usage) {
    let g = |k: &str| u[k].as_u64();
    if let Some(v) = g("input_tokens") {
        into.input_tokens = v;
    }
    if let Some(v) = g("output_tokens") {
        into.output_tokens = v;
    }
    if let Some(v) = g("cache_read_input_tokens") {
        into.cache_read_input_tokens = v;
    }
    if let Some(v) = g("cache_creation_input_tokens") {
        into.cache_creation_input_tokens = v;
    }
}

impl SseState {
    /// Feed raw network bytes. A chunk can end in the middle of a multi-byte
    /// UTF-8 character, so incomplete trailing bytes wait for the next chunk.
    pub fn feed_bytes(&mut self, carry: &mut Vec<u8>, chunk: &[u8]) -> usize {
        carry.extend_from_slice(chunk);
        let valid = match std::str::from_utf8(carry) {
            Ok(s) => s.len(),
            Err(e) => e.valid_up_to(),
        };
        let text = String::from_utf8_lossy(&carry[..valid]).into_owned();
        carry.drain(..valid);
        self.feed(&text)
    }

    /// Feed a chunk; returns how many text characters were added.
    pub fn feed(&mut self, chunk: &str) -> usize {
        self.buf.push_str(&chunk.replace("\r\n", "\n"));
        let before = self.text.len();
        while let Some(pos) = self.buf.find("\n\n") {
            let event: String = self.buf.drain(..pos + 2).collect();
            let data: String = event
                .lines()
                .filter_map(|l| l.strip_prefix("data:"))
                .map(|l| l.trim_start())
                .collect::<Vec<_>>()
                .join("\n");
            if data.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<Value>(&data) {
                self.handle(&v);
            }
        }
        self.text.len() - before
    }

    fn handle(&mut self, v: &Value) {
        match v["type"].as_str().unwrap_or("") {
            "message_start" => {
                self.model = v["message"]["model"].as_str().map(String::from);
                read_usage(&v["message"]["usage"], &mut self.usage);
            }
            "content_block_start" => {
                if v["content_block"]["type"] == "text" {
                    if let Some(i) = v["index"].as_u64() {
                        self.text_blocks.push(i as usize);
                    }
                    if let Some(t) = v["content_block"]["text"].as_str() {
                        self.text.push_str(t);
                    }
                }
            }
            "content_block_delta" => {
                let idx = v["index"].as_u64().unwrap_or(u64::MAX) as usize;
                if v["delta"]["type"] == "text_delta" && self.text_blocks.contains(&idx) {
                    if let Some(t) = v["delta"]["text"].as_str() {
                        self.text.push_str(t);
                    }
                }
            }
            "message_delta" => {
                if let Some(s) = v["delta"]["stop_reason"].as_str() {
                    self.stop_reason = Some(s.to_string());
                }
                read_usage(&v["usage"], &mut self.usage);
            }
            "error" => {
                let e = &v["error"];
                self.error = Some((
                    e["type"].as_str().unwrap_or("error").to_string(),
                    e["message"].as_str().unwrap_or("Unknown error").to_string(),
                ));
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_text_across_split_chunks_and_skips_thinking() {
        let stream = concat!(
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"model\":\"claude-opus-5-5\",\"usage\":{\"input_tokens\":10,\"cache_read_input_tokens\":7}}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"hmm\"}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"{\\\"a\\\":\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"1}\"}}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":42}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        );
        let mut s = SseState::default();
        // Feed in awkward 7-byte pieces to exercise buffering.
        let bytes = stream.as_bytes();
        for c in bytes.chunks(7) {
            s.feed(std::str::from_utf8(c).unwrap());
        }
        assert_eq!(s.text, "{\"a\":1}");
        assert_eq!(s.stop_reason.as_deref(), Some("end_turn"));
        assert_eq!(s.model.as_deref(), Some("claude-opus-5-5"));
        assert_eq!(s.usage.input_tokens, 10);
        assert_eq!(s.usage.cache_read_input_tokens, 7);
        assert_eq!(s.usage.output_tokens, 42);
    }

    #[test]
    fn survives_multibyte_characters_split_across_chunks() {
        let ev = "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"café — ok\"}}\n\n";
        let bytes = ev.as_bytes();
        let cut = ev.find('é').unwrap() + 1; // inside the two-byte é
        let mut s = SseState::default();
        let mut carry = Vec::new();
        s.feed_bytes(&mut carry, &bytes[..cut]);
        s.feed_bytes(&mut carry, &bytes[cut..]);
        assert_eq!(s.text, "café — ok");
    }

    #[test]
    fn records_error_events() {
        let mut s = SseState::default();
        s.feed("event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n");
        assert_eq!(s.error, Some(("overloaded_error".into(), "Overloaded".into())));
    }
}
