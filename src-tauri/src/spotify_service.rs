use librespot::core::{
    SpotifyUri,
    session::Session,
};
use librespot::metadata::{Metadata, Playlist, Track};
use serde::{Deserialize, Serialize};
use spotstream::auth::DeviceAuthResponse;
use spotstream::{PlaylistInfo, PlaylistItemInfo, TrackInfo};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyAuthStatus {
    pub authenticated: bool,
    pub cache_dir: String,
    pub credentials_file: String,
    pub username: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyRadioTrack {
    pub id: String,
    pub uri: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u32,
    pub thumbnail: String,
}

pub struct SpotifySessionState {
    session: Mutex<Option<Arc<Session>>>,
}

impl SpotifySessionState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }

    pub async fn get_or_init(&self) -> Result<Arc<Session>, String> {
        let mut lock = self.session.lock().await;
        if let Some(ref s) = *lock {
            if !s.is_invalid() {
                return Ok(s.clone());
            }
        }

        let cache_dir = resolve_cache_dir();
        let s = spotstream::player::get_session(&cache_dir)
            .await
            .map_err(|e| format!("Spotify session initialization failed: {}", e))?;
        let arc_session = Arc::new(s);
        *lock = Some(arc_session.clone());
        Ok(arc_session)
    }

    pub async fn disconnect(&self) -> Result<bool, String> {
        let mut lock = self.session.lock().await;
        if let Some(s) = lock.take() {
            s.shutdown();
        }

        let cache_dir = resolve_cache_dir();
        let cred_file = cache_dir.join("credentials.json");
        if cred_file.is_file() {
            let _ = std::fs::remove_file(&cred_file);
        }

        Ok(true)
    }
}

pub fn resolve_cache_dir() -> PathBuf {
    if let Ok(env_dir) = std::env::var("SPOTSTREAM_CACHE_DIR") {
        if !env_dir.trim().is_empty() {
            return PathBuf::from(env_dir.trim());
        }
    }
    if let Some(mut local_dir) = dirs::data_local_dir() {
        local_dir.push("spotstream");
        local_dir.push("cache");
        return local_dir;
    }
    PathBuf::from(".spotstream_cache")
}

#[tauri::command]
pub async fn spotify_auth_status(state: State<'_, SpotifySessionState>) -> Result<SpotifyAuthStatus, String> {
    let cache_dir = resolve_cache_dir();
    let cred_file = cache_dir.join("credentials.json");
    let has_credentials = cred_file.is_file();

    let mut username = None;
    if has_credentials {
        if let Ok(session) = state.get_or_init().await {
            let u = session.username();
            if !u.is_empty() {
                username = Some(u);
            }
        }
    }

    Ok(SpotifyAuthStatus {
        authenticated: has_credentials,
        cache_dir: cache_dir.to_string_lossy().to_string(),
        credentials_file: cred_file.to_string_lossy().to_string(),
        username,
    })
}

#[tauri::command]
pub async fn spotify_start_pairing() -> Result<DeviceAuthResponse, String> {
    spotstream::auth::request_pairing_code()
        .await
        .map_err(|e| format!("Failed to request Spotify pairing code: {}", e))
}

#[tauri::command]
pub async fn spotify_poll_pairing(
    device_code: String,
    expires_in: u64,
    interval: u64,
    state: State<'_, SpotifySessionState>,
) -> Result<bool, String> {
    let cache_dir = resolve_cache_dir();
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache directory: {}", e))?;

    spotstream::auth::poll_and_save(&cache_dir, &device_code, expires_in, interval)
        .await
        .map_err(|e| format!("Spotify pairing failed: {}", e))?;

    // Reset session in state so next call connects with the newly saved credentials
    let _ = state.get_or_init().await;

    Ok(true)
}

#[tauri::command]
pub async fn spotify_disconnect(state: State<'_, SpotifySessionState>) -> Result<bool, String> {
    state.disconnect().await
}

#[tauri::command]
pub async fn spotify_track_info(
    track_id: String,
    state: State<'_, SpotifySessionState>,
) -> Result<TrackInfo, String> {
    let parsed_id = spotstream::player::parse_track_id(&track_id)
        .map_err(|e| format!("Invalid track ID: {}", e))?;

    let session = state.get_or_init().await?;
    let track_uri = SpotifyUri::Track { id: parsed_id };

    let track = Track::get(&session, &track_uri)
        .await
        .map_err(|e| format!("Failed to fetch track from Spotify: {}", e))?;

    let artists: Vec<String> = track.artists.iter().map(|a| a.name.clone()).collect();
    let base62_id = parsed_id.to_base62().unwrap_or_else(|_| "unknown".to_string());

    Ok(TrackInfo {
        id: base62_id,
        title: track.name,
        artists,
        album: track.album.name,
        duration_ms: track.duration,
    })
}

#[tauri::command]
pub async fn spotify_playlist_info(
    playlist_id: String,
    state: State<'_, SpotifySessionState>,
) -> Result<PlaylistInfo, String> {
    let parsed_id = spotstream::player::parse_playlist_id(&playlist_id)
        .map_err(|e| format!("Invalid playlist ID: {}", e))?;

    let session = state.get_or_init().await?;
    let playlist_uri = SpotifyUri::Playlist {
        id: parsed_id,
        user: None,
    };

    let playlist = Playlist::get(&session, &playlist_uri)
        .await
        .map_err(|e| format!("Failed to fetch playlist from Spotify: {}", e))?;

    let mut tracks = Vec::new();
    for item in playlist.contents.items.0 {
        if let SpotifyUri::Track { id } = item.id {
            let base62 = id.to_base62().unwrap_or_else(|_| "unknown".to_string());
            tracks.push(PlaylistItemInfo {
                id: base62.clone(),
                uri: format!("spotify:track:{base62}"),
            });
        }
    }

    Ok(PlaylistInfo {
        name: playlist.attributes.name,
        description: playlist.attributes.description,
        tracks,
    })
}

#[tauri::command]
pub async fn spotify_get_radio_tracks(
    seed_track_id: String,
    limit: Option<usize>,
    state: State<'_, SpotifySessionState>,
) -> Result<Vec<SpotifyRadioTrack>, String> {
    let parsed_id = spotstream::player::parse_track_id(&seed_track_id)
        .map_err(|e| format!("Invalid track ID: {}", e))?;

    let session = state.get_or_init().await?;
    let track_uri = SpotifyUri::Track { id: parsed_id };

    // Try get_radio_for_track first
    let max = limit.unwrap_or(20);
    let mut radio_tracks = Vec::new();

    if let Ok(raw_bytes) = session.spclient().get_radio_for_track(&track_uri).await {
        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&raw_bytes) {
            // Check for tracks in the response JSON
            let track_nodes = val.get("tracks")
                .or_else(|| val.pointer("/playlist/contents/items"))
                .or_else(|| val.get("items"))
                .and_then(|v| v.as_array());

            if let Some(nodes) = track_nodes {
                for node in nodes {
                    if radio_tracks.len() >= max {
                        break;
                    }
                    let uri_str = node.get("uri")
                        .or_else(|| node.pointer("/track/uri"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    if let Ok(tid) = spotstream::player::parse_track_id(uri_str) {
                        let base62 = tid.to_base62().unwrap_or_else(|_| "unknown".to_string());
                        let title = node.get("name")
                            .or_else(|| node.pointer("/track/name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown Title")
                            .to_string();

                        let artist = node.pointer("/artists/0/name")
                            .or_else(|| node.pointer("/track/artists/0/name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("Spotify Artist")
                            .to_string();

                        let album = node.pointer("/album/name")
                            .or_else(|| node.pointer("/track/album/name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        let duration = node.get("durationMs")
                            .or_else(|| node.pointer("/track/duration_ms"))
                            .or_else(|| node.get("duration"))
                            .and_then(|v| v.as_u64())
                            .map(|d| (d / 1000) as u32)
                            .unwrap_or(180);

                        let thumbnail = node.pointer("/album/images/0/url")
                            .or_else(|| node.pointer("/track/album/images/0/url"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        radio_tracks.push(SpotifyRadioTrack {
                            id: format!("spotify:{}", base62),
                            uri: format!("spotify:track:{}", base62),
                            title,
                            artist,
                            album,
                            duration,
                            thumbnail,
                        });
                    }
                }
            }
        }
    }

    // Fallback: try get_apollo_station if get_radio_for_track returned empty
    if radio_tracks.is_empty() {
        if let Ok(uri_str) = track_uri.to_uri() {
            if let Ok(raw_bytes) = session.spclient().get_apollo_station("tracks", &uri_str, Some(max), vec![], true).await {
                if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&raw_bytes) {
                    if let Some(nodes) = val.get("tracks").and_then(|v| v.as_array()) {
                        for node in nodes {
                            if radio_tracks.len() >= max {
                                break;
                            }
                            let u_str = node.get("uri").and_then(|v| v.as_str()).unwrap_or("");
                            if let Ok(tid) = spotstream::player::parse_track_id(u_str) {
                                let base62 = tid.to_base62().unwrap_or_else(|_| "unknown".to_string());
                                let title = node.get("title")
                                    .or_else(|| node.get("name"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("Unknown Title")
                                    .to_string();
                                let artist = node.pointer("/artist/name")
                                    .or_else(|| node.pointer("/artists/0/name"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("Spotify Artist")
                                    .to_string();
                                let album = node.pointer("/album/name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();

                                radio_tracks.push(SpotifyRadioTrack {
                                    id: format!("spotify:{}", base62),
                                    uri: format!("spotify:track:{}", base62),
                                    title,
                                    artist,
                                    album,
                                    duration: 180,
                                    thumbnail: "".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(radio_tracks)
}
