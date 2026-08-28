use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

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
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DbPlaylist {
    pub id: String,
    pub name: String,
    pub cover_data_url: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub tracks: Vec<DbTrack>,
}

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

        // Initialize SQLite Tables
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                artist_id TEXT,
                album TEXT,
                duration INTEGER NOT NULL DEFAULT 0,
                thumbnail TEXT,
                query TEXT,
                spotify_id TEXT,
                spotify_url TEXT,
                youtube_id TEXT,
                audio_url TEXT,
                audio_url_expiry INTEGER,
                local_audio_path TEXT,
                play_count INTEGER NOT NULL DEFAULT 0,
                last_played INTEGER,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                cover_data_url TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id TEXT NOT NULL,
                track_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                PRIMARY KEY (playlist_id, track_id),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS playback_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT NOT NULL,
                played_at INTEGER NOT NULL,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS match_cache (
                spotify_id TEXT PRIMARY KEY,
                youtube_id TEXT NOT NULL,
                youtube_title TEXT NOT NULL,
                youtube_artist TEXT NOT NULL,
                score INTEGER NOT NULL,
                matched_at INTEGER NOT NULL
            );
            ",
        )
        .map_err(|e| format!("Failed to initialize SQLite tables: {}", e))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}
