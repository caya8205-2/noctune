use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct DbState {
    pub conn: Mutex<Connection>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DbTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub artist_id: Option<String>,
    pub album: Option<String>,
    pub duration: u32,
    pub thumbnail: String,
    pub query: Option<String>,
    pub spotify_id: Option<String>,
    pub spotify_url: Option<String>,
    pub youtube_id: Option<String>,
    pub audio_url: Option<String>,
    pub audio_url_expiry: Option<i64>,
    pub local_audio_path: Option<String>,
    pub play_count: u32,
    pub last_played: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub cover_data_url: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub track_ids: Vec<String>,
    pub tracks: Option<Vec<DbTrack>>,
}

const LIKED_PLAYLIST_ID: &str = "system-liked-songs";
const LIKED_PLAYLIST_NAME: &str = "Liked Songs";

impl DbState {
    pub fn init(app_handle: &AppHandle) -> std::result::Result<Self, String> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;

        let db_path = app_dir.join("noctune.db");
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open SQLite DB: {}", e))?;

        // Initialize SQLite Tables & PRAGMA
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                cover_data_url TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                track_id TEXT NOT NULL,
                metadata_json TEXT,
                position INTEGER NOT NULL,
                added_at INTEGER NOT NULL,
                PRIMARY KEY (playlist_id, track_id)
            );

            CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position
                ON playlist_tracks(playlist_id, position);

            CREATE TABLE IF NOT EXISTS playback_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT NOT NULL,
                metadata_json TEXT,
                played_at INTEGER NOT NULL
            );
            ",
        )
        .map_err(|e| format!("Failed to initialize SQLite tables: {}", e))?;

        // Ensure system Liked Songs playlist exists
        let now = chrono_now_ms();
        let _ = conn.execute(
            "INSERT OR IGNORE INTO playlists (id, name, cover_data_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            params![LIKED_PLAYLIST_ID, LIKED_PLAYLIST_NAME, None::<String>, now, now],
        );

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

fn chrono_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

// ─── Tauri Commands: Playlists ────────────────────────────────────────────────

#[tauri::command]
pub async fn get_all_playlists(state: State<'_, DbState>) -> Result<Vec<Playlist>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, cover_data_url, created_at, updated_at FROM playlists ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let playlist_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut playlists = Vec::new();
    for pl in playlist_rows {
        let (id, name, cover_data_url, created_at, updated_at) = pl.map_err(|e| e.to_string())?;

        let mut track_stmt = conn
            .prepare("SELECT track_id, metadata_json FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC")
            .map_err(|e| e.to_string())?;

        let track_rows = track_stmt
            .query_map(params![id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .map_err(|e| e.to_string())?;

        let mut track_ids = Vec::new();
        let mut tracks = Vec::new();

        for t in track_rows {
            let (track_id, meta) = t.map_err(|e| e.to_string())?;
            track_ids.push(track_id);
            if let Some(json_str) = meta {
                if let Ok(track_obj) = serde_json::from_str::<DbTrack>(&json_str) {
                    tracks.push(track_obj);
                }
            }
        }

        playlists.push(Playlist {
            id,
            name,
            cover_data_url,
            created_at,
            updated_at,
            track_ids,
            tracks: Some(tracks),
        });
    }

    Ok(playlists)
}

#[tauri::command]
pub async fn create_user_playlist(name: String, state: State<'_, DbState>) -> Result<Playlist, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let trimmed = name.trim();

    let exists: Option<i32> = conn
        .query_row(
            "SELECT 1 FROM playlists WHERE lower(name) = lower(?) LIMIT 1",
            params![trimmed],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if exists.is_some() {
        return Err("Playlist already exists".to_string());
    }

    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| format!("pl-{}", d.as_millis()))
        .unwrap_or_else(|_| "pl-custom".to_string());

    let now = chrono_now_ms();

    conn.execute(
        "INSERT INTO playlists (id, name, cover_data_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        params![id, trimmed, None::<String>, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Playlist {
        id,
        name: trimmed.to_string(),
        cover_data_url: None,
        created_at: now,
        updated_at: now,
        track_ids: Vec::new(),
        tracks: Some(Vec::new()),
    })
}

#[tauri::command]
pub async fn delete_user_playlist(id: String, state: State<'_, DbState>) -> Result<bool, String> {
    if id == LIKED_PLAYLIST_ID {
        return Err("System playlist cannot be deleted".to_string());
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM playlists WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn add_track_to_playlist(
    playlist_id: String,
    track: DbTrack,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let track_id = if let Some(ref sp) = track.spotify_id {
        format!("spotify:{}", sp)
    } else {
        track.id.clone()
    };

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?",
            params![playlist_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let meta_json = serde_json::to_string(&track).unwrap_or_default();
    let now = chrono_now_ms();

    conn.execute(
        "INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, metadata_json, position, added_at) VALUES (?, ?, ?, ?, ?)",
        params![playlist_id, track_id, meta_json, count as i32, now],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE playlists SET updated_at = ? WHERE id = ?",
        params![now, playlist_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub async fn remove_track_from_playlist(
    playlist_id: String,
    track_id: String,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?",
        params![playlist_id, track_id],
    )
    .map_err(|e| e.to_string())?;

    let now = chrono_now_ms();
    conn.execute(
        "UPDATE playlists SET updated_at = ? WHERE id = ?",
        params![now, playlist_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub async fn toggle_like_track(track: DbTrack, state: State<'_, DbState>) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let track_id = if let Some(ref sp) = track.spotify_id {
        format!("spotify:{}", sp)
    } else {
        track.id.clone()
    };

    let exists: Option<i32> = conn
        .query_row(
            "SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ? LIMIT 1",
            params![LIKED_PLAYLIST_ID, track_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let now = chrono_now_ms();

    if exists.is_some() {
        conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?",
            params![LIKED_PLAYLIST_ID, track_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?",
                params![LIKED_PLAYLIST_ID],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let meta_json = serde_json::to_string(&track).unwrap_or_default();
        conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, metadata_json, position, added_at) VALUES (?, ?, ?, ?, ?)",
            params![LIKED_PLAYLIST_ID, track_id, meta_json, count as i32, now],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE playlists SET updated_at = ? WHERE id = ?",
            params![now, LIKED_PLAYLIST_ID],
        )
        .map_err(|e| e.to_string())?;
        Ok(true)
    }
}
