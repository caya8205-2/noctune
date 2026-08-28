use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;
use walkdir::WalkDir;

use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileMetadata {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration: u32,
    pub thumbnail: Option<String>,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub format: String,
    pub file_size: u64,
    pub directory: String,
    pub import_root: String,
    pub added_at: i64,
    pub last_scanned: i64,
}

const SUPPORTED_EXTENSIONS: &[&str] = &["mp3", "m4a", "flac", "wav", "ogg", "opus", "webm", "aac", "wma"];

fn is_supported_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| SUPPORTED_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn path_to_id(path_str: &str) -> String {
    format!("local:{}", path_str.replace('\\', "/"))
}

pub fn read_audio_tags(file_path: &Path) -> Option<LocalFileMetadata> {
    let path_str = file_path.to_string_lossy().to_string();
    let file_size = std::fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);
    let format = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("unknown")
        .to_lowercase();

    let fallback_title = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown Track")
        .to_string();

    let parent_dir = file_path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let (title, artist, album, duration, thumbnail, track_number, year, genre) =
        if let Ok(tagged_file) = Probe::open(file_path).and_then(|p| p.read()) {
            let props = tagged_file.properties();
            let duration = props.duration().as_secs() as u32;

            let (t, art, alb, trk, yr, gen, thumb) = if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
                let t = tag.title().as_deref().unwrap_or(&fallback_title).to_string();
                let art = tag.artist().as_deref().unwrap_or("Unknown Artist").to_string();
                let alb = tag.album().as_deref().map(|s| s.to_string());
                let trk = tag.track();
                let yr = tag.year();
                let gen = tag.genre().as_deref().map(|s| s.to_string());

                let thumb = tag.pictures().first().map(|pic| {
                    let mime = pic.mime_type().map(|m| m.as_str()).unwrap_or("image/jpeg");
                    format!("data:{};base64,{}", mime, BASE64.encode(pic.data()))
                });

                (t, art, alb, trk, yr, gen, thumb)
            } else {
                (fallback_title, "Unknown Artist".to_string(), None, None, None, None, None)
            };

            (t, art, alb, duration, thumb, trk, yr, gen)
        } else {
            (fallback_title, "Unknown Artist".to_string(), None, 0, None, None, None, None)
        };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    Some(LocalFileMetadata {
        id: path_to_id(&path_str),
        path: path_str,
        title,
        artist,
        album,
        duration,
        thumbnail,
        track_number,
        year,
        genre,
        format,
        file_size,
        directory: parent_dir,
        import_root: String::new(),
        added_at: now,
        last_scanned: now,
    })
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn scan_local_folder(
    folder_path: String,
    state: State<'_, DbState>,
) -> Result<Vec<LocalFileMetadata>, String> {
    let p = PathBuf::from(&folder_path);
    if !p.exists() || !p.is_dir() {
        return Err("Directory does not exist".to_string());
    }

    let mut scanned = Vec::new();
    let import_root = folder_path.clone();

    for entry in WalkDir::new(&p).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() && is_supported_audio(path) {
            if let Some(mut meta) = read_audio_tags(path) {
                meta.import_root = import_root.clone();
                scanned.push(meta);
            }
        }
    }

    // Upsert into local_files SQLite table
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS local_files (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            title TEXT,
            artist TEXT,
            album TEXT,
            duration INTEGER,
            thumbnail TEXT,
            trackNumber INTEGER,
            year INTEGER,
            genre TEXT,
            format TEXT,
            fileSize INTEGER,
            directory TEXT,
            import_root TEXT,
            addedAt INTEGER NOT NULL,
            lastScanned INTEGER NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "
            INSERT OR REPLACE INTO local_files (
                id, path, title, artist, album, duration, thumbnail, trackNumber,
                year, genre, format, fileSize, directory, import_root, addedAt, lastScanned
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ",
        )
        .map_err(|e| e.to_string())?;

    for item in &scanned {
        stmt.execute(params![
            item.id,
            item.path,
            item.title,
            item.artist,
            item.album,
            item.duration,
            item.thumbnail,
            item.track_number,
            item.year,
            item.genre,
            item.format,
            item.file_size as i64,
            item.directory,
            item.import_root,
            item.added_at,
            item.last_scanned,
        ])
        .map_err(|e| e.to_string())?;
    }

    Ok(scanned)
}

#[tauri::command]
pub async fn get_local_files(
    folder_path: Option<String>,
    state: State<'_, DbState>,
) -> Result<Vec<LocalFileMetadata>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let sql = if folder_path.is_some() {
        "SELECT id, path, title, artist, album, duration, thumbnail, trackNumber, year, genre, format, fileSize, directory, import_root, addedAt, lastScanned FROM local_files WHERE import_root = ? ORDER BY title ASC"
    } else {
        "SELECT id, path, title, artist, album, duration, thumbnail, trackNumber, year, genre, format, fileSize, directory, import_root, addedAt, lastScanned FROM local_files ORDER BY title ASC"
    };

    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return Ok(Vec::new()),
    };

    let rows = if let Some(ref root) = folder_path {
        stmt.query_map(params![root], map_local_file_row)
    } else {
        stmt.query_map([], map_local_file_row)
    }
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        if let Ok(meta) = row {
            result.push(meta);
        }
    }

    Ok(result)
}

fn map_local_file_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LocalFileMetadata> {
    Ok(LocalFileMetadata {
        id: row.get(0)?,
        path: row.get(1)?,
        title: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "Unknown Track".to_string()),
        artist: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "Unknown Artist".to_string()),
        album: row.get(4)?,
        duration: row.get::<_, Option<u32>>(5)?.unwrap_or(0),
        thumbnail: row.get(6)?,
        track_number: row.get(7)?,
        year: row.get(8)?,
        genre: row.get(9)?,
        format: row.get::<_, Option<String>>(10)?.unwrap_or_else(|| "audio".to_string()),
        file_size: row.get::<_, Option<i64>>(11)?.unwrap_or(0) as u64,
        directory: row.get::<_, Option<String>>(12)?.unwrap_or_default(),
        import_root: row.get::<_, Option<String>>(13)?.unwrap_or_default(),
        added_at: row.get(14)?,
        last_scanned: row.get(15)?,
    })
}
