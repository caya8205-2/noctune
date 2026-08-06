mod youtube_channel;
use youtube_channel::{get_youtube_channel, get_youtube_playlist};

use std::process::Command;
#[cfg(not(debug_assertions))]
use tauri::{path::BaseDirectory, Manager};
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

#[cfg(not(debug_assertions))]
struct BackendProcess(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only http(s) URLs can be opened externally".to_string());
    }

    #[cfg(target_os = "windows")]
    let result = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", &url])
        .spawn();

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&url).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(&url).spawn();

    result.map(|_| ()).map_err(|err| err.to_string())
}

#[cfg(not(debug_assertions))]
fn kill_backend_sidecar<R: tauri::Runtime>(manager: &impl Manager<R>) {
    if let Some(state) = manager.try_state::<BackendProcess>() {
        if let Ok(mut child) = state.0.lock() {
            if let Some(child) = child.take() {
                let _ = child.kill();
            }
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![open_external_url, get_youtube_channel, get_youtube_playlist])
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

                let (mut rx, child) = _app
                    .shell()
                    .sidecar("noctune-backend")
                    .expect("failed to create sidecar command")
                    .env("APP_DATA_DIR", app_data_dir.to_string_lossy().to_string())
                    .env("YT_DLP_PATH", ytdlp_path.to_string_lossy().to_string())
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
