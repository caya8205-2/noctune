mod innertube_service;
mod youtube_channel;

use innertube_service::{
    get_video_metadata, get_watch_next_tracks, resolve_audio_stream, search_youtube_tracks,
    InnertubeState,
};
use youtube_channel::{get_youtube_channel, get_youtube_playlist};

use std::process::Command;
#[cfg(not(debug_assertions))]
use std::sync::Mutex;
#[cfg(not(debug_assertions))]
use tauri::Manager;
#[cfg(not(debug_assertions))]
use tauri::path::BaseDirectory;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::process::CommandChild;

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(debug_assertions))]
struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg(not(debug_assertions))]
fn kill_backend_sidecar(app: &tauri::Window) {
    if let Some(state) = app.try_state::<BackendProcess>() {
        let mut child_lock = state.0.lock().unwrap();
        if let Some(child) = child_lock.take() {
            let pid = child.pid();
            let _ = child.kill();
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(InnertubeState::new())
        .invoke_handler(tauri::generate_handler![
            open_external_url,
            get_youtube_channel,
            get_youtube_playlist,
            resolve_audio_stream,
            get_video_metadata,
            search_youtube_tracks,
            get_watch_next_tracks
        ])
        .setup(|_app| {
            // Only spawn the backend sidecar in production builds.
            // In dev mode the backend is started separately via `npm run dev`.
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_shell::process::CommandEvent;

                // Determine app data directory for backend config/data
                let app_data_dir = _app
                    .path()
                    .app_data_dir()
                    .expect("failed to resolve app data dir");
                let ytdlp_path = _app
                    .path()
                    .resolve("resources/yt-dlp.exe", BaseDirectory::Resource)
                    .expect("failed to resolve bundled yt-dlp path");
                let innertube_path = _app
                    .path()
                    .resolve("resources/innertube.exe", BaseDirectory::Resource)
                    .expect("failed to resolve bundled innertube path");

                let (mut rx, child) = _app
                    .shell()
                    .sidecar("noctune-backend")
                    .expect("failed to create sidecar command")
                    .env("APP_DATA_DIR", app_data_dir.to_string_lossy().to_string())
                    .env("YT_DLP_PATH", ytdlp_path.to_string_lossy().to_string())
                    .env("INNERTUBE_PATH", innertube_path.to_string_lossy().to_string())
                    .env("DISCORD_CLIENT_ID", option_env!("DISCORD_CLIENT_ID").unwrap_or(""))
                    .env("DISCORD_RPC_ENABLED", option_env!("DISCORD_RPC_ENABLED").unwrap_or("true"))
                    .env(
                        "DISCORD_RPC_LARGE_IMAGE_KEY",
                        option_env!("DISCORD_RPC_LARGE_IMAGE_KEY").unwrap_or(""),
                    )
                    .env(
                        "DISCORD_RPC_SMALL_IMAGE_KEY",
                        option_env!("DISCORD_RPC_SMALL_IMAGE_KEY").unwrap_or(""),
                    )
                    .env("LAST_FM_KEY", option_env!("LAST_FM_KEY").unwrap_or(""))
                    .env("LAST_FM_SECRET", option_env!("LAST_FM_SECRET").unwrap_or(""))
                    .env("SPOTIFY_CLIENT_ID", option_env!("SPOTIFY_CLIENT_ID").unwrap_or(""))
                    .env("SPOTIFY_CLIENT_SECRET", option_env!("SPOTIFY_CLIENT_SECRET").unwrap_or(""))
                    .spawn()
                    .expect("failed to spawn noctune-backend sidecar");

                _app.manage(BackendProcess(std::sync::Mutex::new(Some(child))));

                // Forward backend stdout/stderr while the sidecar is alive.
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                print!("[backend] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                eprint!("[backend] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Terminated(_) => {
                                break;
                            }
                            _ => {}
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|_window, _event| {
            #[cfg(not(debug_assertions))]
            if _window.label() == "main" && matches!(_event, tauri::WindowEvent::CloseRequested { .. }) {
                let window = _window.clone();
                tauri::async_runtime::spawn(async move {
                    kill_backend_sidecar(&window);
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
