use innertube_rs::{
    FormatFilter, FormatType, Innertube, QualityPreference, SearchResultItem,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::OnceCell;

pub struct InnertubeState {
    pub client: OnceCell<Arc<Innertube>>,
}

impl InnertubeState {
    pub fn new() -> Self {
        Self {
            client: OnceCell::new(),
        }
    }

    pub async fn get_or_init(&self) -> Result<Arc<Innertube>, String> {
        self.client
            .get_or_try_init(|| async {
                Innertube::new()
                    .await
                    .map(Arc::new)
                    .map_err(|e| format!("Failed to initialize InnerTube client: {}", e))
            })
            .await
            .cloned()
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedAudioStream {
    pub url: String,
    pub format: Option<String>,
    pub quality: Option<String>,
    pub bitrate: Option<u64>,
    pub content_length: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InnertubeTrackInfo {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub artist_id: Option<String>,
    pub album: Option<String>,
    pub duration: u32,
    pub thumbnail: String,
    pub youtube_id: String,
}

fn parse_duration_str(s: &str) -> u32 {
    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        1 => parts[0].parse::<u32>().unwrap_or(0),
        2 => {
            let m = parts[0].parse::<u32>().unwrap_or(0);
            let sec = parts[1].parse::<u32>().unwrap_or(0);
            m * 60 + sec
        }
        3 => {
            let h = parts[0].parse::<u32>().unwrap_or(0);
            let m = parts[1].parse::<u32>().unwrap_or(0);
            let sec = parts[2].parse::<u32>().unwrap_or(0);
            h * 3600 + m * 60 + sec
        }
        _ => 0,
    }
}

#[tauri::command]
pub async fn resolve_audio_stream(
    video_id: String,
    quality: Option<String>,
    state: State<'_, InnertubeState>,
) -> Result<ResolvedAudioStream, String> {
    let client = state.get_or_init().await?;

    let quality_pref = match quality.as_deref() {
        Some("low") => QualityPreference::Lowest,
        Some("medium") => QualityPreference::Lowest,
        _ => QualityPreference::Highest,
    };

    let filter = FormatFilter {
        format_type: FormatType::AudioOnly,
        quality: quality_pref,
        container: None,
    };

    let stream_url = client
        .get_stream_url(&video_id, &filter)
        .await
        .map_err(|e| format!("Failed to resolve audio stream: {}", e))?;

    Ok(ResolvedAudioStream {
        url: stream_url,
        format: Some("audio/webm".to_string()),
        quality: quality.or(Some("high".to_string())),
        bitrate: None,
        content_length: None,
    })
}

#[tauri::command]
pub async fn get_video_metadata(
    video_id: String,
    state: State<'_, InnertubeState>,
) -> Result<InnertubeTrackInfo, String> {
    let client = state.get_or_init().await?;
    let info = client
        .get_video_info(&video_id)
        .await
        .map_err(|e| format!("Failed to get video info: {}", e))?;

    let details = info
        .video_details
        .ok_or_else(|| "No video details returned from InnerTube".to_string())?;

    let thumbnail = details
        .thumbnail
        .and_then(|t| t.thumbnails.last().map(|x| x.url.clone()))
        .unwrap_or_default();

    let duration = details.length_seconds.parse::<u32>().unwrap_or(0);

    Ok(InnertubeTrackInfo {
        id: details.video_id.clone(),
        title: details.title,
        artist: details.author,
        artist_id: Some(details.channel_id),
        album: None,
        duration,
        thumbnail,
        youtube_id: details.video_id,
    })
}

#[tauri::command]
pub async fn search_youtube_tracks(
    query: String,
    limit: Option<usize>,
    state: State<'_, InnertubeState>,
) -> Result<Vec<InnertubeTrackInfo>, String> {
    let client = state.get_or_init().await?;
    let results = client
        .search(&query, None)
        .await
        .map_err(|e| format!("Search failed: {}", e))?;

    let max = limit.unwrap_or(20);
    let mut tracks = Vec::new();

    for item in results.items {
        if tracks.len() >= max {
            break;
        }
        if let SearchResultItem::Video(v) = item {
            let thumb = v
                .thumbnails
                .last()
                .map(|t| t.url.clone())
                .unwrap_or_default();

            let dur = v.duration.as_deref().map(parse_duration_str).unwrap_or(0);

            tracks.push(InnertubeTrackInfo {
                id: v.video_id.clone(),
                title: v.title,
                artist: v.author,
                artist_id: Some(v.channel_id),
                album: None,
                duration: dur,
                thumbnail: thumb,
                youtube_id: v.video_id,
            });
        }
    }

    Ok(tracks)
}

#[tauri::command]
pub async fn get_watch_next_tracks(
    video_id: String,
    state: State<'_, InnertubeState>,
) -> Result<Vec<InnertubeTrackInfo>, String> {
    let client = state.get_or_init().await?;
    let watch_next = client
        .get_watch_next(&video_id)
        .await
        .map_err(|e| format!("Watch next failed: {}", e))?;

    let mut tracks = Vec::new();

    // 1. Check autoplay video
    if let Some(autoplay) = watch_next.autoplay {
        let thumb = autoplay
            .thumbnails
            .last()
            .map(|t| t.url.clone())
            .unwrap_or_default();

        tracks.push(InnertubeTrackInfo {
            id: autoplay.video_id.clone(),
            title: autoplay.title,
            artist: autoplay.author,
            artist_id: None,
            album: None,
            duration: 0,
            thumbnail: thumb,
            youtube_id: autoplay.video_id,
        });
    }

    // 2. Add related videos
    for item in watch_next.related_videos {
        let thumb = item
            .thumbnails
            .last()
            .map(|t| t.url.clone())
            .unwrap_or_default();

        tracks.push(InnertubeTrackInfo {
            id: item.video_id.clone(),
            title: item.title,
            artist: item.author,
            artist_id: item.author_id,
            album: None,
            duration: item.duration_seconds.map(|d| d as u32).unwrap_or_else(|| {
                item.duration_text
                    .as_deref()
                    .map(parse_duration_str)
                    .unwrap_or(0)
            }),
            thumbnail: thumb,
            youtube_id: item.video_id,
        });
    }

    Ok(tracks)
}
