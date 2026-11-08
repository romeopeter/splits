//! The Anthropic API key, kept in the OS keychain.
//!
//! macOS Keychain, Windows Credential Manager or the Linux Secret Service,
//! through the `keyring` crate. Only Rust reads the key; the WebView can ask
//! whether one is stored and see its last four characters, nothing more.

use keyring::Entry;

use crate::error::{AppError, AppResult};

const SERVICE: &str = "com.duowork.splits";
const ACCOUNT: &str = "anthropic-api-key";

fn entry() -> AppResult<Entry> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| AppError::Keychain(e.to_string()))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tokio::task::spawn_blocking(f).await.map_err(|e| AppError::Keychain(e.to_string()))?
}

pub async fn set(key: String) -> AppResult<()> {
    let key = key.trim().to_string();
    if key.len() < 20 || key.chars().any(char::is_whitespace) {
        return Err(AppError::Invalid("That does not look like an Anthropic API key.".into()));
    }
    blocking(move || entry()?.set_password(&key).map_err(|e| AppError::Keychain(e.to_string()))).await
}

pub async fn get() -> AppResult<Option<String>> {
    blocking(|| match entry()?.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keychain(e.to_string())),
    })
    .await
}

pub async fn require() -> AppResult<String> {
    get().await?.ok_or(AppError::ClaudeNotConnected)
}

pub async fn delete() -> AppResult<()> {
    blocking(|| match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keychain(e.to_string())),
    })
    .await
}

/// `…abcd`, so the person can tell which key is connected.
pub fn hint(key: &str) -> String {
    let tail: String = key.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("…{tail}")
}
