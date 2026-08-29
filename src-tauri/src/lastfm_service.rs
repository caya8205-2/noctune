use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

const LASTFM_API_BASE: &str = "https://ws.audioscrobbler.com/2.0/";

pub struct LastFmState {
    pub client: Arc<Client>,
}

impl LastFmState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Client::builder().build().unwrap_or_default()),
        }
    }

    fn resolve_api_key(&self) -> Option<String> {
        if let Ok(val) = std::env::var("LAST_FM_KEY") {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        if let Some(val) = option_env!("LAST_FM_KEY") {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        None
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SimilarTrack {
    pub title: String,
    pub artist: String,
    pub match_score: f64,
}

#[derive(Debug, Deserialize)]
struct LastFmArtistObj {
    name: String,
}

#[derive(Debug, Deserialize)]
struct LastFmTrackObj {
    name: String,
    artist: LastFmArtistObj,
    #[serde(default)]
    r#match: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct SimilarTracksContainer {
    #[serde(default)]
    track: Vec<LastFmTrackObj>,
}

#[derive(Debug, Deserialize)]
struct LastFmSimilarResponse {
    similartracks: Option<SimilarTracksContainer>,
    error: Option<u32>,
    message: Option<String>,
}

#[tauri::command]
pub async fn get_lastfm_similar_tracks(
    title: String,
    artist: String,
    limit: Option<usize>,
    state: tauri::State<'_, LastFmState>,
) -> Result<Vec<SimilarTrack>, String> {
    let api_key = match state.resolve_api_key() {
        Some(k) => k,
        None => return Ok(Vec::new()),
    };

    let max = limit.unwrap_or(20);
    let url = format!(
        "{}?method=track.getSimilar&track={}&artist={}&limit={}&autocorrect=1&api_key={}&format=json",
        LASTFM_API_BASE,
        urlencoding::encode(&title),
        urlencoding::encode(&artist),
        max,
        api_key
    );

    let resp = state
        .client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Last.fm network error: {}", e))?;

    if !resp.status().is_success() {
        return Ok(Vec::new());
    }

    let data: LastFmSimilarResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Last.fm response: {}", e))?;

    if let Some(err_code) = data.error {
        if err_code == 6 {
            // Track not found on Last.fm
            return Ok(Vec::new());
        }
        return Err(format!("Last.fm error {}: {:?}", err_code, data.message));
    }

    let mut results = Vec::new();
    if let Some(container) = data.similartracks {
        for t in container.track {
            let match_score = match t.r#match {
                serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
                serde_json::Value::String(ref s) => s.parse::<f64>().unwrap_or(0.0),
                _ => 0.0,
            };

            results.push(SimilarTrack {
                title: t.name,
                artist: t.artist.name,
                match_score,
            });
        }
    }

    Ok(results)
}
