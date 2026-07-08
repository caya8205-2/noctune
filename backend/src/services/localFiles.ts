import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Music-metadata causes pkg bundling issues, so we conditionally load it
let parseFileFunc: any = null;

async function getParseFile() {
  if (parseFileFunc) return parseFileFunc;
  
  try {
    const mm = await import('music-metadata');
    parseFileFunc = mm.parseFile;
    return parseFileFunc;
  } catch (err) {
    console.warn('[localFiles] music-metadata not available:', err);
    return null;
  }
}

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
  
  // Create table if not exists
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
  `);
  
  // Migration: Add directory column if it doesn't exist
  try {
    const columns = db.pragma('table_info(local_files)') as any[];
    const hasDirectory = columns.some((col: any) => col.name === 'directory');
    
    if (!hasDirectory) {
      console.log('[localFiles] Migrating database: adding directory column');
      db.exec(`ALTER TABLE local_files ADD COLUMN directory TEXT DEFAULT '';`);
      
      // Populate directory for existing files
      const files = db.prepare('SELECT id, path FROM local_files').all() as { id: string; path: string }[];
      const updateStmt = db.prepare('UPDATE local_files SET directory = ? WHERE id = ?');
      
      for (const file of files) {
        const dir = path.dirname(file.path);
        updateStmt.run(dir, file.id);
      }
      
      console.log(`[localFiles] Migration complete: updated ${files.length} files with directory`);
    }
  } catch (err) {
    console.error('[localFiles] Migration failed:', err);
  }
  
  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_local_files_added
      ON local_files(addedAt DESC);

    CREATE INDEX IF NOT EXISTS idx_local_files_title
      ON local_files(title COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS idx_local_files_artist
      ON local_files(artist COLLATE NOCASE);
      
    CREATE INDEX IF NOT EXISTS idx_local_files_directory
      ON local_files(directory);
  `);
  
  db.close();
}

export interface LocalFile {
  id: string;
  path: string;
  directory: string; // Parent directory path
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
    const parseFile = await getParseFile();
    
    // Check if music-metadata is available
    if (!parseFile) {
      console.error('[localFiles] music-metadata not available - cannot scan files');
      return null;
    }

    if (!fs.existsSync(filePath)) {
      console.warn('[localFiles] file does not exist:', filePath);
      return null;
    }

    console.log('[localFiles] scanning file:', filePath);
    const stat = fs.statSync(filePath);
    const metadata = await parseFile(filePath);

    const common = metadata.common;
    const format = metadata.format;

    const id = crypto.randomUUID();
    const directory = path.dirname(filePath);
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
          directory = ?, title = ?, artist = ?, album = ?, duration = ?, thumbnail = ?,
          trackNumber = ?, year = ?, genre = ?, format = ?, fileSize = ?,
          lastScanned = ?
        WHERE path = ?
      `).run(directory, title, artist, album, duration, thumbnail, trackNumber, year, genre, audioFormat, fileSize, Date.now(), filePath);
      db.close();
      return getLocalFile(existing.id);
    } else {
      const now = Date.now();
      db.prepare(`
        INSERT INTO local_files (id, path, directory, title, artist, album, duration, thumbnail, trackNumber, year, genre, format, fileSize, addedAt, lastScanned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, filePath, directory, title, artist, album, duration, thumbnail, trackNumber, year, genre, audioFormat, fileSize, now, now);
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

export function getDirectories(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT directory FROM local_files ORDER BY directory').all() as { directory: string }[];
  db.close();
  return rows.map(r => r.directory);
}

export function getFilesByDirectory(directory: string): LocalFile[] {
  const db = getDb();
  const files = db.prepare('SELECT * FROM local_files WHERE directory = ? ORDER BY trackNumber, title').all(directory) as LocalFile[];
  db.close();
  return files;
}
