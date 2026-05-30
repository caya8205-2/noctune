#[cfg(not(debug_assertions))]
use tauri::Manager;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

#[cfg(not(debug_assertions))]
struct BackendProcess(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

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

                let (mut rx, child) = _app
                    .shell()
                    .sidecar("noctune-backend")
                    .expect("failed to create sidecar command")
                    .env("APP_DATA_DIR", app_data_dir.to_string_lossy().to_string())
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
            if matches!(_event, tauri::WindowEvent::CloseRequested { .. }) {
                kill_backend_sidecar(_window);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
