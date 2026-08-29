use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlayLogEvent {
    pub track_id: String,
    pub artist: String,
    pub title: String,
    pub album: Option<String>,
    pub timestamp: u64,
    pub hour_of_day: u32,
    pub day_of_week: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MlModelStats {
    pub play_log_count: usize,
    pub unique_tracks_count: usize,
    pub transition_pairs_count: usize,
    pub last_trained_at: u64,
    pub is_ready: bool,
    pub has_seed_model: bool,
    pub seed_track_count: usize,
}

#[derive(Debug, Deserialize, Clone)]
struct SeedModelData {
    #[allow(dead_code)]
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub transitions: HashMap<String, HashMap<String, f64>>,
}

pub struct MlState {
    pub data_dir: Mutex<PathBuf>,
    pub play_log_cache: Mutex<Option<Vec<PlayLogEvent>>>,
    pub transition_matrix: Mutex<Option<HashMap<String, HashMap<String, f64>>>>,
    #[allow(dead_code)]
    pub last_train_time: Mutex<u64>,
}

impl MlState {
    pub fn new() -> Self {
        Self {
            data_dir: Mutex::new(PathBuf::from("backend/data")),
            play_log_cache: Mutex::new(None),
            transition_matrix: Mutex::new(None),
            last_train_time: Mutex::new(0),
        }
    }

    #[allow(dead_code)]
    pub fn set_data_dir(&self, path: PathBuf) {
        if let Ok(mut dir) = self.data_dir.lock() {
            *dir = path;
        }
    }

    fn get_play_log_file(&self) -> PathBuf {
        let dir = self.data_dir.lock().unwrap();
        dir.join("play-log.json")
    }

    pub fn load_play_log(&self) -> Vec<PlayLogEvent> {
        let mut cache_lock = self.play_log_cache.lock().unwrap();
        if let Some(ref log) = *cache_lock {
            return log.clone();
        }

        let file_path = self.get_play_log_file();
        if !file_path.exists() {
            *cache_lock = Some(Vec::new());
            return Vec::new();
        }

        let events: Vec<PlayLogEvent> = fs::read_to_string(&file_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        *cache_lock = Some(events.clone());
        events
    }

    pub fn save_play_log(&self, events: &[PlayLogEvent]) {
        let mut cache_lock = self.play_log_cache.lock().unwrap();
        *cache_lock = Some(events.to_vec());

        let file_path = self.get_play_log_file();
        if let Some(parent) = file_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_string_pretty(events) {
            let _ = fs::write(&file_path, raw);
        }
    }

    pub fn build_matrix(&self) -> HashMap<String, HashMap<String, f64>> {
        let mut matrix_lock = self.transition_matrix.lock().unwrap();
        if let Some(ref m) = *matrix_lock {
            return m.clone();
        }

        let mut matrix: HashMap<String, HashMap<String, f64>> = HashMap::new();

        // 1. Try to load seed-model.json from known relative paths
        let candidate_paths = [
            PathBuf::from("backend/data/seed-model.json"),
            PathBuf::from("backend/src/data/seed-model.json"),
            PathBuf::from("dist/data/seed-model.json"),
            PathBuf::from("src/data/seed-model.json"),
        ];

        for p in &candidate_paths {
            if p.exists() {
                if let Ok(raw) = fs::read_to_string(p) {
                    if let Ok(seed) = serde_json::from_str::<SeedModelData>(&raw) {
                        for (from_id, targets) in seed.transitions {
                            let entry = matrix.entry(from_id).or_default();
                            for (to_id, weight) in targets {
                                *entry.entry(to_id).or_default() += weight;
                            }
                        }
                        break;
                    }
                }
            }
        }

        // 2. Overlay user play log transitions
        let logs = self.load_play_log();
        for i in 0..logs.len().saturating_sub(1) {
            let from_id = &logs[i].track_id;
            let to_id = &logs[i + 1].track_id;
            let diff = logs[i + 1].timestamp.saturating_sub(logs[i].timestamp);

            if diff > 0 && diff <= 30 * 60 * 1000 && from_id != to_id {
                let entry = matrix.entry(from_id.clone()).or_default();
                *entry.entry(to_id.clone()).or_default() += 1.0;
            }
        }

        *matrix_lock = Some(matrix.clone());
        matrix
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordMlPlayPayload {
    pub track_id: String,
    pub artist: String,
    pub title: String,
    pub album: Option<String>,
}

#[tauri::command]
pub async fn record_ml_play_event(
    track: RecordMlPlayPayload,
    state: tauri::State<'_, MlState>,
) -> Result<bool, String> {
    let mut log = state.load_play_log();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    log.push(PlayLogEvent {
        track_id: track.track_id,
        artist: track.artist,
        title: track.title,
        album: track.album,
        timestamp: now,
        hour_of_day: 12,
        day_of_week: 1,
    });

    if log.len() > 5000 {
        let excess = log.len() - 5000;
        log.drain(0..excess);
    }

    state.save_play_log(&log);

    // Invalidate cached transition matrix
    if let Ok(mut matrix_lock) = state.transition_matrix.lock() {
        *matrix_lock = None;
    }

    Ok(true)
}

#[tauri::command]
pub async fn get_ml_model_stats(state: tauri::State<'_, MlState>) -> Result<MlModelStats, String> {
    let log = state.load_play_log();
    let matrix = state.build_matrix();

    let mut unique_tracks = HashSet::new();
    let mut pair_count = 0;

    for (from_id, targets) in &matrix {
        unique_tracks.insert(from_id.clone());
        for to_id in targets.keys() {
            unique_tracks.insert(to_id.clone());
            pair_count += 1;
        }
    }

    Ok(MlModelStats {
        play_log_count: log.len(),
        unique_tracks_count: unique_tracks.len(),
        transition_pairs_count: pair_count,
        last_trained_at: 0,
        is_ready: !matrix.is_empty(),
        has_seed_model: true,
        seed_track_count: unique_tracks.len(),
    })
}
