use std::{fs, path::Path};

const FORWARDED_ENV_KEYS: &[&str] = &[
    "DISCORD_CLIENT_ID",
    "DISCORD_RPC_ENABLED",
    "DISCORD_RPC_LARGE_IMAGE_KEY",
    "DISCORD_RPC_SMALL_IMAGE_KEY",
    "LAST_FM_KEY",
    "LAST_FM_SECRET",
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
];

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
        if !FORWARDED_ENV_KEYS.contains(&key) {
            continue;
        }

        // CI secrets are injected as process environment variables and must
        // take precedence over a local .env file.
        if std::env::var(key).is_ok_and(|value| !value.trim().is_empty()) {
            continue;
        }

        let value = value.trim().trim_matches('"').trim_matches('\'');
        export_dotenv_value(key, value);
    }
}

fn ensure_sidecar_dummy() {
    let target = std::env::var("TARGET").unwrap_or_default();
    if target.is_empty() {
        return;
    }
    let binaries_dir = Path::new("binaries");
    let binary_name = if target.contains("windows") {
        format!("noctune-backend-{}.exe", target)
    } else {
        format!("noctune-backend-{}", target)
    };
    let binary_path = binaries_dir.join(binary_name);
    if !binary_path.exists() {
        let _ = fs::create_dir_all(binaries_dir);
        let _ = fs::write(&binary_path, b"");
    }
}

fn main() {
    ensure_sidecar_dummy();
    load_dotenv(Path::new("../.env"));
    for key in FORWARDED_ENV_KEYS {
        println!("cargo:rerun-if-env-changed={}", key);
        if let Ok(value) = std::env::var(key) {
            if !value.trim().is_empty() {
                export_dotenv_value(key, &value);
            }
        }
    }
    tauri_build::build()
}
