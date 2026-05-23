use tauri::Manager;
use tauri_plugin_shell::ShellExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Only spawn the backend sidecar in production builds.
            // In dev mode the backend is started separately via `npm run dev`.
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_shell::process::CommandEvent;

                // Determine app data directory for backend config/data
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .expect("failed to resolve app data dir");

                let (mut rx, child) = app
                    .shell()
                    .sidecar("noctune-backend")
                    .expect("failed to create sidecar command")
                    .env("APP_DATA_DIR", app_data_dir.to_string_lossy().to_string())
                    .spawn()
                    .expect("failed to spawn noctune-backend sidecar");

                // Forward backend stdout/stderr and keep the child alive
                // by moving it into this async task.
                tauri::async_runtime::spawn(async move {
                    let _child = child; // keep alive until rx closes
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                print!("[backend] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                eprint!("[backend] {}", String::from_utf8_lossy(&line));
                            }
                            _ => {}
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
