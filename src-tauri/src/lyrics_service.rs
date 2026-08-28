use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

const LRCLIB_BASE: &str = "https://lrclib.net/api";
const USER_AGENT: &str = "Noctune/1.0.0 (https://github.com/caya8205-2/noctune)";

pub struct LyricsState {
    pub client: Arc<Client>,
}

impl LyricsState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(
                Client::builder()
                    .user_agent(USER_AGENT)
                    .timeout(std::time::Duration::from_secs(8))
                    .build()
                    .unwrap_or_default(),
            ),
        }
    }

    pub fn get_client(&self) -> Arc<Client> {
        self.client.clone()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LyricsLine {
    pub time: f64,
    pub text: String,
    pub romanized_text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult {
    pub id: u64,
    pub source: String,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: Option<String>,
    pub duration: f64,
    pub instrumental: bool,
    pub synced: bool,
    pub plain_lyrics: Option<String>,
    pub lines: Vec<LyricsLine>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibResponse {
    id: u64,
    track_name: Option<String>,
    name: Option<String>,
    artist_name: Option<String>,
    album_name: Option<String>,
    duration: Option<f64>,
    instrumental: Option<bool>,
    plain_lyrics: Option<String>,
    synced_lyrics: Option<String>,
}

fn parse_synced_lyrics(synced: &str) -> Vec<LyricsLine> {
    let mut lines = Vec::new();
    for line in synced.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            if let Some(close_idx) = trimmed.find(']') {
                let time_str = &trimmed[1..close_idx];
                let text = trimmed[close_idx + 1..].trim().to_string();

                // Format: MM:SS.xx or MM:SS:xx
                let parts: Vec<&str> = time_str.split(|c| c == ':' || c == '.').collect();
                if parts.len() >= 2 {
                    let min: f64 = parts[0].parse().unwrap_or(0.0);
                    let sec: f64 = parts[1].parse().unwrap_or(0.0);
                    let ms: f64 = if parts.len() >= 3 {
                        let ms_str = parts[2];
                        let val: f64 = ms_str.parse().unwrap_or(0.0);
                        if ms_str.len() == 2 {
                            val / 100.0
                        } else {
                            val / 1000.0
                        }
                    } else {
                        0.0
                    };

                    lines.push(LyricsLine {
                        time: min * 60.0 + sec + ms,
                        text,
                        romanized_text: None,
                    });
                }
            }
        }
    }
    lines
}

fn parse_plain_lyrics(plain: &str) -> Vec<LyricsLine> {
    plain
        .lines()
        .map(|l| LyricsLine {
            time: 0.0,
            text: l.trim().to_string(),
            romanized_text: None,
        })
        .collect()
}

#[tauri::command]
pub async fn get_lyrics(
    title: String,
    artist: String,
    duration: Option<u32>,
    state: tauri::State<'_, LyricsState>,
) -> Result<Option<LyricsResult>, String> {
    let client = state.get_client();

    let mut url = format!(
        "{}/get?track_name={}&artist_name={}",
        LRCLIB_BASE,
        urlencoding::encode(&title),
        urlencoding::encode(&artist)
    );

    if let Some(dur) = duration {
        if dur > 0 {
            url.push_str(&format!("&duration={}", dur));
        }
    }

    let resp = match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => {
            // Fallback to search endpoint if exact get fails
            let search_url = format!(
                "{}/search?track_name={}&artist_name={}",
                LRCLIB_BASE,
                urlencoding::encode(&title),
                urlencoding::encode(&artist)
            );
            match client.get(&search_url).send().await {
                Ok(r) if r.status().is_success() => {
                    let items: Vec<LrclibResponse> = r.json().await.unwrap_or_default();
                    if let Some(first) = items.into_iter().next() {
                        return Ok(Some(convert_lrclib_item(first, &title, &artist)));
                    }
                    return Ok(None);
                }
                _ => return Ok(None),
            }
        }
    };

    if let Ok(item) = resp.json::<LrclibResponse>().await {
        Ok(Some(convert_lrclib_item(item, &title, &artist)))
    } else {
        Ok(None)
    }
}

fn convert_lrclib_item(item: LrclibResponse, fallback_title: &str, fallback_artist: &str) -> LyricsResult {
    let synced = item.synced_lyrics.is_some();
    let lines = if let Some(ref s) = item.synced_lyrics {
        parse_synced_lyrics(s)
    } else if let Some(ref p) = item.plain_lyrics {
        parse_plain_lyrics(p)
    } else {
        Vec::new()
    };

    LyricsResult {
        id: item.id,
        source: "lrclib".to_string(),
        track_name: item.track_name.or(item.name).unwrap_or_else(|| fallback_title.to_string()),
        artist_name: item.artist_name.unwrap_or_else(|| fallback_artist.to_string()),
        album_name: item.album_name,
        duration: item.duration.unwrap_or(0.0),
        instrumental: item.instrumental.unwrap_or(false),
        synced,
        plain_lyrics: item.plain_lyrics,
        lines,
    }
}
