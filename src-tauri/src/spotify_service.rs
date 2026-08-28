use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

const SPOTIFY_AUTH_URL: &str = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE: &str = "https://api.spotify.com/v1";

pub struct SpotifyState {
    pub client: Arc<Client>,
    pub token: RwLock<Option<CachedToken>>,
    pub credentials: RwLock<Option<SpotifyCredentials>>,
}

#[derive(Clone)]
pub struct SpotifyCredentials {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Clone)]
pub struct CachedToken {
    pub access_token: String,
    pub expires_at: i64,
}

impl SpotifyState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Client::builder().build().unwrap_or_default()),
            token: RwLock::new(None),
            credentials: RwLock::new(None),
        }
    }

    pub async fn set_credentials(&self, client_id: String, client_secret: String) {
        let mut creds = self.credentials.write().await;
        *creds = Some(SpotifyCredentials {
            client_id,
            client_secret,
        });
        // Invalidate token
        let mut token = self.token.write().await;
        *token = None;
    }

    pub async fn get_token(&self) -> Result<String, String> {
        let now = chrono_now_ms();

        // Check if cached token is still fresh (with 60s buffer)
        {
            let read = self.token.read().await;
            if let Some(ref t) = *read {
                if t.expires_at > now + 60_000 {
                    return Ok(t.access_token.clone());
                }
            }
        }

        // Fetch fresh token via client credentials
        let creds = self.credentials.read().await.clone().ok_or_else(|| {
            "Spotify client credentials not configured".to_string()
        })?;

        if creds.client_id.is_empty() || creds.client_secret.is_empty() {
            return Err("Spotify client ID or secret is empty".to_string());
        }

        let resp = self
            .client
            .post(SPOTIFY_AUTH_URL)
            .basic_auth(&creds.client_id, Some(&creds.client_secret))
            .form(&[("grant_type", "client_credentials")])
            .send()
            .await
            .map_err(|e| format!("Failed to request Spotify token: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Spotify auth error: HTTP {}", resp.status()));
        }

        #[derive(Deserialize)]
        struct TokenResp {
            access_token: String,
            expires_in: i64,
        }

        let data: TokenResp = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse Spotify token: {}", e))?;

        let access_token = data.access_token;
        let expires_at = now + (data.expires_in * 1000);

        let mut write = self.token.write().await;
        *write = Some(CachedToken {
            access_token: access_token.clone(),
            expires_at,
        });

        Ok(access_token)
    }
}

fn chrono_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

// ─── Data Transfer Objects ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyArtistInfo {
    pub id: String,
    pub name: String,
    pub genres: Vec<String>,
    pub popularity: Option<u32>,
    pub followers: Option<u64>,
    pub image: Option<String>,
    pub spotify_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyAlbumInfo {
    pub id: String,
    pub name: String,
    pub r#type: Option<String>,
    pub release_date: Option<String>,
    pub total_tracks: Option<u32>,
    pub label: Option<String>,
    pub image: Option<String>,
    pub spotify_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyTrackMetadata {
    pub id: String,
    pub title: String,
    pub artists: Vec<SpotifyArtistInfo>,
    pub album: SpotifyAlbumInfo,
    pub duration: u32,
    pub explicit: bool,
    pub popularity: Option<u32>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub isrc: Option<String>,
    pub spotify_url: Option<String>,
    pub cached_at: i64,
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn set_spotify_credentials(
    client_id: String,
    client_secret: String,
    state: tauri::State<'_, SpotifyState>,
) -> Result<bool, String> {
    state.set_credentials(client_id, client_secret).await;
    Ok(true)
}

#[tauri::command]
pub async fn get_spotify_track_metadata(
    spotify_id: String,
    state: tauri::State<'_, SpotifyState>,
) -> Result<SpotifyTrackMetadata, String> {
    let clean_id = spotify_id.replace("spotify:track:", "").replace("spotify:", "");
    let token = state.get_token().await?;

    let url = format!("{}/tracks/{}", SPOTIFY_API_BASE, clean_id);
    let resp = state
        .client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Spotify API error: HTTP {}", resp.status()));
    }

    let raw: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let title = raw["name"].as_str().unwrap_or("Unknown Title").to_string();
    let duration = (raw["duration_ms"].as_u64().unwrap_or(0) / 1000) as u32;
    let explicit = raw["explicit"].as_bool().unwrap_or(false);
    let popularity = raw["popularity"].as_u64().map(|p| p as u32);
    let track_number = raw["track_number"].as_u64().map(|n| n as u32);
    let disc_number = raw["disc_number"].as_u64().map(|n| n as u32);
    let isrc = raw["external_ids"]["isrc"].as_str().map(|s| s.to_string());
    let spotify_url = raw["external_urls"]["spotify"].as_str().map(|s| s.to_string());

    let album_obj = &raw["album"];
    let album_id = album_obj["id"].as_str().unwrap_or_default().to_string();
    let album_name = album_obj["name"].as_str().unwrap_or_default().to_string();
    let album_type = album_obj["album_type"].as_str().map(|s| s.to_string());
    let release_date = album_obj["release_date"].as_str().map(|s| s.to_string());
    let total_tracks = album_obj["total_tracks"].as_u64().map(|n| n as u32);
    let album_image = album_obj["images"].as_array().and_then(|arr| arr.first()).and_then(|img| img["url"].as_str()).map(|s| s.to_string());
    let album_url = album_obj["external_urls"]["spotify"].as_str().map(|s| s.to_string());

    let mut artists = Vec::new();
    if let Some(arr) = raw["artists"].as_array() {
        for a in arr {
            let a_id = a["id"].as_str().unwrap_or_default().to_string();
            let a_name = a["name"].as_str().unwrap_or_default().to_string();
            let a_url = a["external_urls"]["spotify"].as_str().map(|s| s.to_string());

            artists.push(SpotifyArtistInfo {
                id: a_id,
                name: a_name,
                genres: Vec::new(),
                popularity: None,
                followers: None,
                image: None,
                spotify_url: a_url,
            });
        }
    }

    Ok(SpotifyTrackMetadata {
        id: clean_id,
        title,
        artists,
        album: SpotifyAlbumInfo {
            id: album_id,
            name: album_name,
            r#type: album_type,
            release_date,
            total_tracks,
            label: None,
            image: album_image,
            spotify_url: album_url,
        },
        duration,
        explicit,
        popularity,
        track_number,
        disc_number,
        isrc,
        spotify_url,
        cached_at: chrono_now_ms(),
    })
}
