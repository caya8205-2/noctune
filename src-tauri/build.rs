use std::{fs, path::Path};

fn export_dotenv_value(key: &str, value: &str) {
    println!("cargo:rustc-env={}={}", key, value);
}

fn load_dotenv(path: &Path) {
    println!("cargo:rerun-if-changed={}", path.display());
    let Ok(raw) = fs::read_to_string(path) else {
        return;
    };

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        let key = key.trim();
        if !matches!(
            key,
            "DISCORD_CLIENT_ID"
                | "DISCORD_RPC_ENABLED"
                | "DISCORD_RPC_LARGE_IMAGE_KEY"
                | "DISCORD_RPC_SMALL_IMAGE_KEY"
                | "LAST_FM_KEY"
                | "LAST_FM_SECRET"
        ) {
            continue;
        }

        let value = value.trim().trim_matches('"').trim_matches('\'');
        export_dotenv_value(key, value);
    }
}

fn main() {
    load_dotenv(Path::new("../.env"));
    tauri_build::build()
}
