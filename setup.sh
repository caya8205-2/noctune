#!/usr/bin/env bash
set -e

echo ""
echo "🎵 muzikku — setup"
echo "────────────────────────────────"

# 1. Check Node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org (v20+)"
  exit 1
fi
echo "✅ Node $(node -v)"

# 2. Check Rust / Cargo
if ! command -v cargo &>/dev/null; then
  echo ""
  echo "⚠️  Rust not found. Installing via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
echo "✅ Rust $(rustc --version)"

# 3. Check Tauri CLI
if ! command -v tauri &>/dev/null; then
  echo "📦 Installing Tauri CLI..."
  cargo install tauri-cli --version "^2.0" --locked
fi
echo "✅ Tauri CLI ready"

# 4. Check yt-dlp
if ! command -v yt-dlp &>/dev/null; then
  echo ""
  echo "⚠️  yt-dlp not found."
  echo "    Install it: https://github.com/yt-dlp/yt-dlp#installation"
  echo "    On macOS:   brew install yt-dlp"
  echo "    On Linux:   pip install yt-dlp  OR  sudo apt install yt-dlp"
  echo "    On Windows: winget install yt-dlp"
  echo ""
  echo "    muzikku won't work without yt-dlp. Install it then re-run this script."
  exit 1
fi
echo "✅ yt-dlp $(yt-dlp --version)"

# 5. npm install
echo ""
echo "📦 Installing npm dependencies..."
npm install

# 6. Create data dir
mkdir -p data
echo "✅ data/ directory created"

echo ""
echo "────────────────────────────────"
echo "✅ Setup complete!"
echo ""
echo "To run in dev mode:"
echo "  npm run dev          — starts backend + frontend"
echo "  cargo tauri dev      — starts full desktop app (from root)"
echo ""
echo "Backend runs on http://127.0.0.1:3131"
echo "Frontend dev server on http://localhost:5173"
echo ""
