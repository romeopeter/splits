//! Saving and loading projects.
//!
//! The project is the frontend's JSON tree (assets, tracks, clips, transcripts,
//! motion clips). Rust stores it as `projects/<id>/project.json` with an atomic
//! write (temp file, then rename) so a crash mid-save never leaves half a file.
//! Rust treats the tree as opaque apart from `id`, `name` and `updatedAt`.

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::paths;

const LAST_FILE: &str = "last-project.txt";

fn project_id(project: &Value) -> AppResult<String> {
    let id = project.get("id").and_then(Value::as_str).ok_or_else(|| AppError::Invalid("Project has no id.".into()))?;
    Ok(paths::safe_id(id)?.to_string())
}

pub fn save(app: &AppHandle, project: &Value) -> AppResult<()> {
    let id = project_id(project)?;
    let dir = paths::project_dir(app, &id)?;
    let tmp = dir.join("project.json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(project)?)?;
    std::fs::rename(&tmp, dir.join("project.json"))?;
    std::fs::write(paths::app_data(app)?.join(LAST_FILE), &id)?;
    Ok(())
}

pub fn load(app: &AppHandle, id: &str) -> AppResult<Option<Value>> {
    let file = paths::project_dir(app, id)?.join("project.json");
    if !file.is_file() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&std::fs::read(file)?)?))
}

pub fn load_last(app: &AppHandle) -> AppResult<Option<Value>> {
    let last = paths::app_data(app)?.join(LAST_FILE);
    match std::fs::read_to_string(last) {
        Ok(id) => load(app, id.trim()),
        Err(_) => Ok(None),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub updated_at: String,
}

pub fn list(app: &AppHandle) -> AppResult<Vec<ProjectSummary>> {
    let dir = paths::sub(app, &["projects"])?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir)?.flatten() {
        let file = entry.path().join("project.json");
        let Ok(bytes) = std::fs::read(&file) else { continue };
        let Ok(v) = serde_json::from_slice::<Value>(&bytes) else { continue };
        out.push(ProjectSummary {
            id: v["id"].as_str().unwrap_or_default().to_string(),
            name: v["name"].as_str().unwrap_or("Untitled").to_string(),
            updated_at: v["updatedAt"].as_str().unwrap_or_default().to_string(),
        });
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}
