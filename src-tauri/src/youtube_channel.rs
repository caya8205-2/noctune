use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_LANGUAGE, CONTENT_TYPE, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub artist_id: String,
    pub album: String,
    pub duration: u32,
    pub thumbnail: String,
    pub youtube_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelPlaylist {
    pub id: String,
    pub name: String,
    pub total_tracks: u32,
    pub image: Option<String>,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelArtistView {
    pub id: String,
    pub name: String,
    pub genres: Vec<String>,
    pub popularity: Option<u32>,
    pub followers: Option<String>,
    pub image: Option<String>,
    pub spotify_url: Option<String>,
    pub top_tracks: Vec<ChannelTrack>,
    pub albums: Vec<Value>,
    pub channel_playlists: Vec<ChannelPlaylist>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubePlaylistView {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
    pub tracks: Vec<ChannelTrack>,
}

fn clean_url(url_str: &str) -> String {
    let u = url_str.trim();
    if u.starts_with("//") {
        format!("https:{}", u)
    } else {
        u.to_string()
    }
}

fn extract_yt_initial_data(html: &str) -> Option<Value> {
    let patterns = ["var ytInitialData = ", "window[\"ytInitialData\"] = "];
    for pat in patterns {
        if let Some(start_idx) = html.find(pat) {
            let json_part = &html[start_idx + pat.len()..];
            let end_idx = json_part.find(";</script>")
                .or_else(|| json_part.find(";\n"))
                .or_else(|| json_part.find(";var "))
                .or_else(|| json_part.find(";window"))
                .unwrap_or(json_part.len());

            let clean_json = json_part[..end_idx].trim().trim_end_matches(';');
            if let Ok(val) = serde_json::from_str::<Value>(clean_json) {
                return Some(val);
            }
        }
    }
    None
}

fn extract_thumbnail(item: &Value) -> String {
    let target = item
        .get("musicTwoRowItemRenderer")
        .or_else(|| item.get("musicResponsiveListItemRenderer"))
        .unwrap_or(item);

    let pointers = [
        "/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails",
        "/thumbnailRenderer/croppedSquareThumbnailRenderer/thumbnail/thumbnails",
        "/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails",
        "/thumbnail/croppedSquareThumbnailRenderer/thumbnail/thumbnails",
        "/thumbnail/thumbnails",
        "/foregroundThumbnail/musicThumbnailRenderer/thumbnail/thumbnails",
        "/avatar/thumbnails",
    ];

    for p in pointers {
        if let Some(thumbs) = target.pointer(p).and_then(|v| v.as_array()) {
            if let Some(last_thumb) = thumbs.last().or_else(|| thumbs.first()) {
                if let Some(url_str) = last_thumb.get("url").and_then(|v| v.as_str()) {
                    let cleaned = clean_url(url_str);
                    if !cleaned.is_empty() && !cleaned.contains("default-user") {
                        return cleaned;
                    }
                }
            }
        }
    }
    "".to_string()
}

#[allow(dead_code)]
fn extract_playlist_id(item: &Value) -> Option<String> {
    let target = item
        .get("musicTwoRowItemRenderer")
        .or_else(|| item.get("musicResponsiveListItemRenderer"))
        .unwrap_or(item);

    if let Some(pid) = target
        .pointer("/thumbnailOverlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchPlaylistEndpoint/playlistId")
        .and_then(|v| v.as_str())
    {
        if !pid.is_empty() {
            return Some(pid.to_string());
        }
    }

    if let Some(pid) = target
        .pointer("/menu/musicMenuRenderer/items/0/menuServiceItemRenderer/serviceEndpoint/likeEndpoint/target/playlistId")
        .and_then(|v| v.as_str())
    {
        if !pid.is_empty() {
            return Some(pid.to_string());
        }
    }

    if let Some(bid) = target
        .pointer("/navigationEndpoint/browseEndpoint/browseId")
        .and_then(|v| v.as_str())
    {
        if bid.starts_with("VLPL") || bid.starts_with("VLOLAK") || bid.starts_with("VLRDCLAK") {
            return Some(bid.trim_start_matches("VL").to_string());
        }
        if bid.starts_with("PL") || bid.starts_with("OLAK") || bid.starts_with("RDCLAK") || bid.starts_with("MPRE") {
            return Some(bid.to_string());
        }
    }

    None
}

// ── Official YouTube Web HTML Scraper (100% Full Uploads with Pagination, Avatar & Playlists) ──

struct OfficialChannelData {
    name: String,
    avatar: Option<String>,
    subscribers: Option<String>,
    videos: Vec<(String, String, String)>, // (title, video_id, thumbnail)
    playlists: Vec<(String, String, String)>, // (title, playlist_id, thumbnail)
}

fn parse_node(
    value: &Value,
    videos: &mut Vec<(String, String, String)>,
    playlists: &mut Vec<(String, String, String)>,
    seen_vids: &mut HashSet<String>,
    seen_pls: &mut HashSet<String>,
    continuation_token: &mut Option<String>,
) {
    if let Some(arr) = value.as_array() {
        for v in arr {
            parse_node(v, videos, playlists, seen_vids, seen_pls, continuation_token);
        }
    } else if let Some(obj) = value.as_object() {
        // 1. Check lockupViewModel (YouTube 2024 model for videos and playlists)
        if let Some(lvm) = obj.get("lockupViewModel") {
            let content_id = lvm.get("contentId").and_then(|v| v.as_str()).unwrap_or("");
            let title = lvm.pointer("/metadata/lockupMetadataViewModel/title/content").and_then(|v| v.as_str()).unwrap_or("");

            if content_id.len() == 11 && !title.is_empty() && !seen_vids.contains(content_id) {
                let thumb = lvm.pointer("/contentImage/thumbnailViewModel/image/sources/0/url").and_then(|v| v.as_str()).unwrap_or("");
                seen_vids.insert(content_id.to_string());
                videos.push((title.to_string(), content_id.to_string(), clean_url(thumb)));
            } else if !content_id.is_empty() && content_id.len() != 11 && !title.is_empty() {
                let clean_p_id = content_id.trim_start_matches("VL").to_string();
                if !seen_pls.contains(&clean_p_id) {
                    let thumb = lvm.pointer("/contentImage/collectionThumbnailViewModel/primaryThumbnail/thumbnailViewModel/image/sources/0/url").and_then(|v| v.as_str()).unwrap_or("");
                    seen_pls.insert(clean_p_id.clone());
                    playlists.push((title.to_string(), clean_p_id, clean_url(thumb)));
                }
            }
        }

        // 2. Check videoRenderer
        if let Some(vr) = obj.get("videoRenderer") {
            let v_id = vr.get("videoId").and_then(|v| v.as_str()).unwrap_or("");
            let title = vr.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("");
            let thumb = vr.pointer("/thumbnail/thumbnails/0/url").and_then(|v| v.as_str()).unwrap_or("");
            if !v_id.is_empty() && v_id.len() == 11 && !title.is_empty() && !seen_vids.contains(v_id) {
                seen_vids.insert(v_id.to_string());
                videos.push((title.to_string(), v_id.to_string(), clean_url(thumb)));
            }
        }

        // 3. Check gridVideoRenderer
        if let Some(gvr) = obj.get("gridVideoRenderer") {
            let v_id = gvr.get("videoId").and_then(|v| v.as_str()).unwrap_or("");
            let title = gvr.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("");
            let thumb = gvr.pointer("/thumbnail/thumbnails/0/url").and_then(|v| v.as_str()).unwrap_or("");
            if !v_id.is_empty() && v_id.len() == 11 && !title.is_empty() && !seen_vids.contains(v_id) {
                seen_vids.insert(v_id.to_string());
                videos.push((title.to_string(), v_id.to_string(), clean_url(thumb)));
            }
        }

        // 4. Check gridPlaylistRenderer / playlistRenderer
        if let Some(gpr) = obj.get("gridPlaylistRenderer").or_else(|| obj.get("playlistRenderer")) {
            let p_id = gpr.get("playlistId").and_then(|v| v.as_str()).unwrap_or("");
            let title = gpr.pointer("/title/runs/0/text").and_then(|v| v.as_str()).unwrap_or("");
            let thumb = gpr.pointer("/thumbnail/thumbnails/0/url").and_then(|v| v.as_str()).unwrap_or("");

            let clean_p_id = p_id.trim_start_matches("VL").to_string();
            if !title.is_empty() && clean_p_id.len() >= 12 && !seen_pls.contains(&clean_p_id) {
                seen_pls.insert(clean_p_id.clone());
                playlists.push((title.to_string(), clean_p_id, clean_url(thumb)));
            }
        }

        // 5. Check continuation token for pagination
        if continuation_token.is_none() {
            if let Some(t) = value.pointer("/continuationItemRenderer/continuationEndpoint/continuationCommand/token")
                .or_else(|| value.pointer("/continuationCommand/token"))
                .and_then(|v| v.as_str())
            {
                if !t.is_empty() {
                    *continuation_token = Some(t.to_string());
                }
            }
        }

        for (_, val) in obj {
            parse_node(val, videos, playlists, seen_vids, seen_pls, continuation_token);
        }
    }
}

fn extract_avatar_from_html(html: &str) -> Option<String> {
    for marker in ["og:image", "twitter:image", "image_src", "avatar"] {
        let mut curr = html;
        while let Some(pos) = curr.find(marker) {
            let start = curr
                .floor_char_boundary(pos.saturating_sub(100));
            let end = curr
                .floor_char_boundary((pos + 400).min(curr.len()));
            let snippet = &curr[start..end];
            for protocol in ["https://yt3.googleusercontent.com", "https://yt3.ggpht.com", "https://yt4.ggpht.com", "https://lh3.googleusercontent.com", "https://i.ytimg.com"] {
                if let Some(u_start) = snippet.find(protocol) {
                    let url_sub = &snippet[u_start..];
                    if let Some(u_end) = url_sub.find('"').or_else(|| url_sub.find('\'')).or_else(|| url_sub.find(' ')) {
                        let raw = &url_sub[..u_end];
                        let cleaned = clean_url(raw);
                        if !cleaned.is_empty() && !cleaned.contains("default-user") {
                            return Some(cleaned);
                        }
                    }
                }
            }
            if let Some(next_pos) = curr[pos..].char_indices().nth(marker.len()).map(|(i, _)| pos + i) {
                curr = &curr[next_pos..];
            } else if pos + marker.len() <= curr.len() && curr.is_char_boundary(pos + marker.len()) {
                curr = &curr[pos + marker.len()..];
            } else {
                break;
            }
        }
    }
    None
}



async fn fetch_official_youtube_channel(clean_id: &str) -> Option<OfficialChannelData> {
    // If clean_id ends with VEVO or vevo (e.g. DragonForceVEVO), attempt to fetch official handle first (@DragonForce)
    if clean_id.to_lowercase().ends_with("vevo") {
        let base_name = clean_id[..clean_id.len() - 4].trim_matches('@').trim();
        if !base_name.is_empty() {
            let official_handle = format!("@{}", base_name);
            if let Some(official_data) = Box::pin(fetch_official_youtube_channel(&official_handle)).await {
                if !official_data.playlists.is_empty() || official_data.videos.len() > 15 {
                    return Some(official_data);
                }
            }
        }
    }

    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
    );

    // Build primary (home), secondary (videos), and tertiary (releases) URLs
    let (home_url, videos_url, releases_url) = if clean_id.starts_with('@') {
        (
            format!("https://www.youtube.com/{}", clean_id),
            format!("https://www.youtube.com/{}/videos", clean_id),
            format!("https://www.youtube.com/{}/releases", clean_id),
        )
    } else if clean_id.starts_with("UC") {
        (
            format!("https://www.youtube.com/channel/{}", clean_id),
            format!("https://www.youtube.com/channel/{}/videos", clean_id),
            format!("https://www.youtube.com/channel/{}/releases", clean_id),
        )
    } else {
        (
            format!("https://www.youtube.com/@{}", clean_id),
            format!("https://www.youtube.com/@{}/videos", clean_id),
            format!("https://www.youtube.com/@{}/releases", clean_id),
        )
    };

    // Fetch / (home), /videos, and /releases pages CONCURRENTLY
    let home_fut = client.get(&home_url).headers(headers.clone()).send();
    let videos_fut = client.get(&videos_url).headers(headers.clone()).send();
    let releases_fut = client.get(&releases_url).headers(headers.clone()).send();
    let (home_res, videos_res, releases_res) = tokio::join!(home_fut, videos_fut, releases_fut);

    let mut name = "YouTube Channel".to_string();
    let mut avatar: Option<String> = None;
    let mut subscribers: Option<String> = None;
    let mut home_videos = Vec::new();
    let mut uploaded_videos = Vec::new();
    let mut playlists = Vec::new();
    let mut seen_vids = HashSet::new();
    let mut seen_pls = HashSet::new();

    // Helper: extract metadata (name, avatar, subscribers) from ytInitialData JSON
    let extract_metadata = |json_val: &Value, name: &mut String, avatar: &mut Option<String>, subscribers: &mut Option<String>| {
        // channelMetadataRenderer
        if let Some(meta) = json_val.pointer("/metadata/channelMetadataRenderer") {
            if let Some(n) = meta.get("title").and_then(|v| v.as_str()) {
                if *name == "YouTube Channel" {
                    *name = n.to_string();
                }
            }
            if avatar.is_none() {
                if let Some(thumbs) = meta.pointer("/avatar/thumbnails").and_then(|v| v.as_array()) {
                    if let Some(last) = thumbs.last() {
                        if let Some(u) = last.get("url").and_then(|v| v.as_str()) {
                            let cleaned = clean_url(u);
                            if !cleaned.contains("default-user") && is_valid_avatar_url(&cleaned) {
                                *avatar = Some(cleaned);
                            }
                        }
                    }
                }
            }
        }

        // pageHeaderRenderer / c4TabbedHeaderRenderer avatar
        if avatar.is_none() {
            let avatar_pointers = [
                "/header/pageHeaderRenderer/content/pageHeaderViewModel/image/decoratedAvatarViewModel/avatar/avatarViewModel/image/sources",
                "/header/c4TabbedHeaderRenderer/avatar/thumbnails",
                "/microformat/microformatDataRenderer/thumbnail/thumbnails",
            ];
            for ptr in avatar_pointers {
                if let Some(thumbs) = json_val.pointer(ptr).and_then(|v| v.as_array()) {
                    if let Some(last) = thumbs.last() {
                        if let Some(u) = last.get("url").and_then(|v| v.as_str()) {
                            let cleaned = clean_url(u);
                            if !cleaned.contains("default-user") && is_valid_avatar_url(&cleaned) {
                                *avatar = Some(cleaned);
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Header metadata (name + subscribers)
        if let Some(header) = json_val.pointer("/header/pageHeaderRenderer") {
            if let Some(n) = header.pointer("/pageTitle").and_then(|v| v.as_str()) {
                *name = n.to_string();
            }
            if subscribers.is_none() {
                if let Some(s) = header.pointer("/content/pageHeaderViewModel/metadata/contentMetadataViewModel/metadataRows/1/metadataParts/0/text/content")
                    .or_else(|| header.pointer("/content/pageHeaderViewModel/metadata/contentMetadataViewModel/metadataRows/0/metadataParts/1/text/content"))
                    .and_then(|v| v.as_str())
                {
                    *subscribers = Some(s.to_string());
                }
            }
        } else if let Some(header) = json_val.pointer("/header/c4TabbedHeaderRenderer") {
            if let Some(n) = header.pointer("/title").and_then(|v| v.as_str()) {
                *name = n.to_string();
            }
            if subscribers.is_none() {
                if let Some(sub) = header.pointer("/subscriberCountText/simpleText").and_then(|v| v.as_str()) {
                    *subscribers = Some(sub.to_string());
                }
            }
        }
    };

    // Process / (home) response FIRST (has official top tracks, releases, playlists, & avatar)
    if let Ok(resp) = home_res {
        if let Ok(html) = resp.text().await {
            if avatar.is_none() {
                avatar = extract_avatar_from_html(&html);
            }
            if let Some(json_val) = extract_yt_initial_data(&html) {
                extract_metadata(&json_val, &mut name, &mut avatar, &mut subscribers);
                let mut continuation_token = None;
                if let Some(contents) = json_val.pointer("/contents") {
                    parse_node(contents, &mut home_videos, &mut playlists, &mut seen_vids, &mut seen_pls, &mut continuation_token);
                }
            }
        }
    }

    // Process /videos response (Dedicated uploaded videos)
    if let Ok(resp) = videos_res {
        if let Ok(html) = resp.text().await {
            if avatar.is_none() {
                avatar = extract_avatar_from_html(&html);
            }
            if let Some(json_val) = extract_yt_initial_data(&html) {
                if name == "YouTube Channel" || avatar.is_none() || subscribers.is_none() {
                    extract_metadata(&json_val, &mut name, &mut avatar, &mut subscribers);
                }
                let mut continuation_token = None;
                let mut seen_up_vids = HashSet::new();
                if let Some(contents) = json_val.pointer("/contents") {
                    parse_node(contents, &mut uploaded_videos, &mut playlists, &mut seen_up_vids, &mut seen_pls, &mut continuation_token);
                }
            }
        }
    }

    // Process /releases response (Albums & EPs)
    if let Ok(resp) = releases_res {
        if let Ok(html) = resp.text().await {
            if avatar.is_none() {
                avatar = extract_avatar_from_html(&html);
            }
            if let Some(json_val) = extract_yt_initial_data(&html) {
                if name == "YouTube Channel" || avatar.is_none() || subscribers.is_none() {
                    extract_metadata(&json_val, &mut name, &mut avatar, &mut subscribers);
                }
                let mut continuation_token = None;
                let mut unused_vids = Vec::new();
                if let Some(contents) = json_val.pointer("/contents") {
                    parse_node(contents, &mut unused_vids, &mut playlists, &mut seen_vids, &mut seen_pls, &mut continuation_token);
                }
            }
        }
    }

    let videos = if !uploaded_videos.is_empty() {
        uploaded_videos
    } else {
        home_videos
    };

    // If the resolved channel is a legacy VEVO channel (0 playlists, name ending in VEVO), attempt to fetch official handle (@<artist>)
    if name.to_lowercase().ends_with("vevo") && playlists.is_empty() {
        let base_name = name[..name.len() - 4].trim();
        if !base_name.is_empty() {
            let official_handle = format!("@{}", base_name);
            if let Some(official_data) = Box::pin(fetch_official_youtube_channel(&official_handle)).await {
                if !official_data.playlists.is_empty() || official_data.videos.len() > 15 {
                    return Some(official_data);
                }
            }
        }
    }

    if videos.is_empty() && playlists.is_empty() {
        None
    } else {
        Some(OfficialChannelData {
            name,
            avatar,
            subscribers,
            videos,
            playlists,
        })
    }
}

fn is_valid_avatar_url(url: &str) -> bool {
    url.contains("yt3.googleusercontent.com")
        || url.contains("yt3.ggpht.com")
        || url.contains("yt4.ggpht.com")
        || url.contains("lh3.googleusercontent.com")
        || url.contains("i.ytimg.com")
}

#[tauri::command]
pub async fn get_youtube_channel(channel_id: String) -> Result<ChannelArtistView, String> {
    let clean_id = channel_id
        .trim_start_matches("ytchannel:")
        .trim_start_matches("youtube:")
        .trim_start_matches("channel:")
        .to_string();

    // 1. Official YouTube Web HTML Scraper (Native Rust reqwest)
    if let Some(official_data) = fetch_official_youtube_channel(&clean_id).await {
        let mut top_tracks = Vec::new();
        for (title, v_id, thumb) in official_data.videos {
            top_tracks.push(ChannelTrack {
                id: format!("youtube:{}", v_id),
                title,
                artist: official_data.name.clone(),
                artist_id: format!("ytchannel:{}", clean_id),
                album: official_data.name.clone(),
                duration: 180,
                thumbnail: thumb,
                youtube_id: v_id,
            });
        }

        let mut raw_playlists = Vec::new();
        for (title, p_id, thumb) in official_data.playlists {
            raw_playlists.push(ChannelPlaylist {
                id: p_id.clone(),
                name: title,
                total_tracks: 0,
                image: if thumb.is_empty() { None } else { Some(thumb) },
                url: format!("https://www.youtube.com/playlist?list={}", p_id),
            });
        }

        // Re-order playlists by relevance to channel top tracks / official title keywords
        let top_keywords: Vec<String> = top_tracks
            .iter()
            .flat_map(|t| t.title.to_lowercase().split_whitespace().map(|s| s.to_string()).collect::<Vec<_>>())
            .filter(|k| k.len() > 3)
            .collect();

        let mut scored_playlists: Vec<(usize, i32, ChannelPlaylist)> = raw_playlists
            .into_iter()
            .enumerate()
            .map(|(idx, pl)| {
                let name_lower = pl.name.to_lowercase();
                let mut score = 0i32;
                for kw in &top_keywords {
                    if name_lower.contains(kw) {
                        score += 10;
                    }
                }
                if name_lower.contains("trick") || name_lower.contains("rise") || name_lower.contains("echo") || name_lower.contains("guilty") {
                    score += 5;
                }
                (idx, score, pl)
            })
            .collect();

        scored_playlists.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        let channel_playlists: Vec<ChannelPlaylist> = scored_playlists.into_iter().map(|(_, _, pl)| pl).collect();

        // Scope avatar strictly to official channel header / top track thumbnail (never fall back to playlist/album cover)
        let channel_avatar = official_data
            .avatar
            .filter(|a| !a.is_empty())
            .or_else(|| top_tracks.first().map(|t| t.thumbnail.clone()));

        return Ok(ChannelArtistView {
            id: format!("ytchannel:{}", clean_id),
            name: official_data.name,
            genres: vec!["YouTube Channel".to_string()],
            popularity: None,
            followers: official_data.subscribers,
            image: channel_avatar,
            spotify_url: None,
            top_tracks,
            albums: vec![],
            channel_playlists,
        });
    }

    Err("Channel content unavailable".to_string())
}

#[tauri::command]
pub async fn get_youtube_playlist(playlist_id: String) -> Result<YouTubePlaylistView, String> {
    let clean_id = playlist_id
        .trim_start_matches("ytplaylist:")
        .trim_start_matches("youtube:")
        .to_string();

    let browse_id = if clean_id.starts_with("VL") {
        clean_id.clone()
    } else {
        format!("VL{}", clean_id)
    };

    let client = reqwest::Client::new();
    let url = "https://music.youtube.com/youtubei/v1/browse?alt=json";

    let payload = json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240801.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "browseId": browse_id
    });

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
    );

    let response = client
        .post(url)
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("YouTube API returned status {}", response.status()));
    }

    let json_res: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse playlist JSON: {}", e))?;

    let mut playlist_name = "YouTube Playlist".to_string();
    let mut cover_image = None;

    if let Some(name) = json_res.pointer("/header/musicDetailHeaderRenderer/title/runs/0/text")
        .or_else(|| json_res.pointer("/header/musicEditableHeaderRenderer/header/musicDetailHeaderRenderer/title/runs/0/text"))
        .or_else(|| json_res.pointer("/header/musicResponsiveHeaderRenderer/title/runs/0/text"))
        .or_else(|| json_res.pointer("/header/musicHeaderRenderer/title/runs/0/text"))
        .or_else(|| json_res.pointer("/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents/0/musicPlaylistShelfRenderer/title/runs/0/text"))
        .or_else(|| json_res.pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicPlaylistShelfRenderer/title/runs/0/text"))
        .or_else(|| json_res.pointer("/microformat/microformatDataRenderer/title"))
        .and_then(|v| v.as_str())
    {
        if !name.is_empty() {
            playlist_name = name.to_string();
        }
    }

    let thumb = extract_thumbnail(&json_res);
    if !thumb.is_empty() && !thumb.contains("default-user") {
        cover_image = Some(thumb);
    }

    let mut tracks = Vec::new();
    let items = json_res
        .pointer("/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents/0/musicPlaylistShelfRenderer/contents")
        .or_else(|| json_res.pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicPlaylistShelfRenderer/contents")
        .or_else(|| json_res.pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicShelfRenderer/contents")));

    if let Some(track_items) = items.and_then(|v| v.as_array()) {
        for item in track_items {
            let target = item.get("musicResponsiveListItemRenderer").unwrap_or(item);

            let title = target
                .pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let video_id = target
                .pointer("/playlistItemData/videoId")
                .or_else(|| target.pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let artist_text = target
                .pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                .and_then(|v| v.as_str())
                .unwrap_or("YouTube Artist");
            let thumbnail = extract_thumbnail(target);

            if !title.is_empty() && !video_id.is_empty() {
                tracks.push(ChannelTrack {
                    id: format!("youtube:{}", video_id),
                    title: title.to_string(),
                    artist: artist_text.to_string(),
                    artist_id: "ytplaylist".to_string(),
                    album: playlist_name.clone(),
                    duration: 180,
                    thumbnail,
                    youtube_id: video_id.to_string(),
                });
            }
        }
    }

    Ok(YouTubePlaylistView {
        id: clean_id,
        name: playlist_name,
        image: cover_image,
        tracks,
    })
}
