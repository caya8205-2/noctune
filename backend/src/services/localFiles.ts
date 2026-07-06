import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { parseFile } from 'music-metadata';

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

export function initLocalFilesDb(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_files (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration INTEGER,
      thumbnail TEXT,
      trackNumber INTEGER,
      year INTEGER,
      genre TEXT,
      format TEXT,
      fileSize INTEGER,
      addedAt INTEGER NOT NULL,
      lastScanned INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_files_added
      ON local_files(addedAt DESC);

    CREATE INDEX IF NOT EXISTS idx_local_files_title
      ON local_files(title COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS idx_local_files_artist
      ON local_files(artist COLLATE NOCASE);
  `);
  db.close();
}

export interface LocalFile {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  thumbnail: string;
  trackNumber: number;
  year: number;
  genre: string;
  format: string;
  fileSize: number;
  addedAt: number;
  lastScanned: number;
}

export async function scanFile(filePath: string): Promise<LocalFile | null> {
  try {
    if (!fs.existsSync(filePath)) return null;

    const stat = fs.statSync(filePath);
    const metadata = await parseFile(filePath);

    const common = metadata.common;
    const format = metadata.format;

    const id = crypto.randomUUID();
    const title = common.title || path.basename(filePath, path.extname(filePath));
    const artist = common.artist || 'Unknown Artist';
    const album = common.album || '';
    const duration = Math.round(format.duration || 0);
    const trackNumber = common.track?.no || 0;
    const year = common.year || 0;
    const genre = common.genre?.[0] || '';
    const audioFormat = format.container || path.extname(filePath).slice(1);
    const fileSize = stat.size;

    let thumbnail = '';
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      const base64 = Buffer.from(pic.data).toString('base64');
      thumbnail = `data:${pic.format};base64,${base64}`;
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM local_files WHERE path = ?').get(filePath) as { id: string } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE local_files SET
          title = ?, artist = ?, album = ?, duration = ?, thumbnail = ?,
          trackNumber = ?, year = ?, genre = ?, format = ?, fileSize = ?,
          lastScanned = ?
        WHERE path = ?
      `).run(title, artist, album, duration, thumbnail, trackNumber, year, genre, audioFormat, fileSize, Date.now(), filePath);
      db.close();
      return getLocalFile(existing.id);
    } else {
      const now = Date.now();
      db.prepare(`
        INSERT INTO local_files (id, path, title, artist, album, duration, thumbnail, trackNumber, year, genre, format, fileSize, addedAt, lastScanned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, filePath, title, artist, album, duration, thumbnail, trackNumber, year, genre, audioFormat, fileSize, now, now);
      db.close();
      return getLocalFile(id);
    }
  } catch (err) {
    console.error('[localFiles] scan failed for', filePath, err);
    return null;
  }
}

export async function scanDirectory(dirPath: string): Promise<{ scanned: number; failed: number }> {
  let scanned = 0;
  let failed = 0;

  const audioExtensions = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.webm']);

  async function walk(dir: string) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        await walk(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (audioExtensions.has(ext)) {
          const result = await scanFile(fullPath);
          if (result) {
            scanned++;
          } else {
            failed++;
          }
        }
      }
    }
  }

  await walk(dirPath);
  return { scanned, failed };
}

export function getLocalFile(id: string): LocalFile | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM local_files WHERE id = ?').get(id) as any;
  db.close();
  return row || null;
}

export function getLibrary(limit = 50, offset = 0): { files: LocalFile[]; total: number } {
  const db = getDb();
  const files = db.prepare('SELECT * FROM local_files ORDER BY addedAt DESC LIMIT ? OFFSET ?').all(limit, offset) as LocalFile[];
  const total = (db.prepare('SELECT COUNT(*) as count FROM local_files').get() as { count: number }).count;
  db.close();
  return { files, total };
}

export function deleteLocalFile(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM local_files WHERE id = ?').run(id);
  db.close();
  return result.changes > 0;
}
