import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { Playlist, Track } from '../types/index.js';

// APP_DATA_DIR can be set at launch so the data folder lands in a predictable
// location. Falls back to <cwd>/data.
const DATA_DIR = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'noctune.db');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getDb(): Database.Database {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

// Init schema (run once)
export function initDb(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL,
      metadata_json TEXT,
      position INTEGER NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, track_id)
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position
      ON playlist_tracks(playlist_id, position);
  `);

  const columns = db.prepare('PRAGMA table_info(playlist_tracks)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'metadata_json')) {
    db.exec('ALTER TABLE playlist_tracks ADD COLUMN metadata_json TEXT');
  }

  db.close();
}

// ─── Playlists ────────────────────────────────────────────────────────────────

export function createPlaylist(name: string): Playlist {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(id, name, now, now);
  db.close();
  return { id, name, createdAt: now, updatedAt: now, trackIds: [] };
}

function parseTrackMetadata(value: string | null): Track | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Track;
  } catch {
    return null;
  }
}

export function getPlaylist(id: string): Playlist | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as {
    id: string; name: string; created_at: number; updated_at: number;
  } | undefined;
  if (!row) { db.close(); return null; }

  const tracks = db
    .prepare('SELECT track_id, metadata_json FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC')
    .all(row.id) as { track_id: string; metadata_json: string | null }[];
  db.close();

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trackIds: tracks.map(t => t.track_id),
    tracks: tracks.map(t => parseTrackMetadata(t.metadata_json)).filter((track): track is Track => Boolean(track)),
  };
}

export function getAllPlaylists(): Playlist[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM playlists ORDER BY updated_at DESC').all() as {
    id: string; name: string; created_at: number; updated_at: number;
  }[];
  const playlists: Playlist[] = rows.map(row => {
    const tracks = db
      .prepare('SELECT track_id, metadata_json FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC')
      .all(row.id) as { track_id: string; metadata_json: string | null }[];
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      trackIds: tracks.map(t => t.track_id),
      tracks: tracks.map(t => parseTrackMetadata(t.metadata_json)).filter((track): track is Track => Boolean(track)),
    };
  });
  db.close();
  return playlists;
}

export function renamePlaylist(id: string, name: string): void {
  const db = getDb();
  db.prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id);
  db.close();
}

export function deletePlaylist(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
  db.close();
}

export function addTrackToPlaylist(playlistId: string, trackId: string, track?: Track): void {
  const db = getDb();
  const maxPos = (db
    .prepare('SELECT MAX(position) as m FROM playlist_tracks WHERE playlist_id = ?')
    .get(playlistId) as { m: number | null }).m ?? -1;
  db.prepare(
    'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, metadata_json, position, added_at) VALUES (?, ?, ?, ?, ?)'
  ).run(playlistId, trackId, track ? JSON.stringify(track) : null, maxPos + 1, Date.now());
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId);
  db.close();
}

export function importPlaylist(name: string, tracks: Track[]): Playlist {
  const playlist = createPlaylist(name);
  for (const track of tracks) {
    addTrackToPlaylist(playlist.id, track.id, track);
  }
  return getPlaylist(playlist.id) ?? playlist;
}

export function reorderPlaylistTracks(playlistId: string, fromIndex: number, toIndex: number): void {
  const db = getDb();
  const rows = db.prepare('SELECT track_id, position FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC').all(playlistId) as { track_id: string; position: number }[];
  if (fromIndex < 0 || fromIndex >= rows.length || toIndex < 0 || toIndex >= rows.length) {
    db.close();
    return;
  }
  const [moved] = rows.splice(fromIndex, 1);
  rows.splice(toIndex, 0, moved);
  const update = db.prepare('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?');
  const tx = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      update.run(i, playlistId, rows[i].track_id);
    }
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId);
  });
  tx();
  db.close();
}
export function removeTrackFromPlaylist(playlistId: string, trackId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, trackId);
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId);
  db.close();
}


