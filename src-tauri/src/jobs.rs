//! Registry of cancellable background jobs (exports, motion generation, downloads).
//!
//! Each job gets a `watch` channel. The job polls or `select!`s on the receiver;
//! the cancel command flips it to `true`.

use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::watch;

#[derive(Default)]
pub struct Jobs {
    inner: Mutex<HashMap<String, watch::Sender<bool>>>,
}

pub type CancelRx = watch::Receiver<bool>;

impl Jobs {
    pub fn register(&self, id: &str) -> CancelRx {
        let (tx, rx) = watch::channel(false);
        self.inner.lock().expect("jobs lock").insert(id.to_string(), tx);
        rx
    }

    pub fn cancel(&self, id: &str) -> bool {
        match self.inner.lock().expect("jobs lock").get(id) {
            Some(tx) => tx.send(true).is_ok(),
            None => false,
        }
    }

    pub fn finish(&self, id: &str) {
        self.inner.lock().expect("jobs lock").remove(id);
    }
}

/// Resolves when the job is cancelled. Never resolves if the sender is dropped
/// without cancelling.
pub async fn cancelled(rx: &mut CancelRx) {
    loop {
        if *rx.borrow() {
            return;
        }
        if rx.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}
