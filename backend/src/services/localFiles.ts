import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';

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

/** Sentinel value for files added via "Add Files" (not part of a folder import). */
export const UNGROUPED_IMPORT_ROOT = '';

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

function folderDisplayName(importRoot: string): string {
  if (!importRoot) return 'Imported Files';
  const base = path.basename(importRoot);
  return base || importRoot;
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

  // Migration: Add import_root column (folder that was imported / library folder grouping)
  try {
    const columns = db.pragma('table_info(local_files)') as any[];
    const hasImportRoot = columns.some((col: any) => col.name === 'import_root');

    if (!hasImportRoot) {
      console.log('[localFiles] Migrating database: adding import_root column');
      db.exec(`ALTER TABLE local_files ADD COLUMN import_root TEXT DEFAULT '';`);

      // Best-effort: group existing tracks by their immediate parent directory
      const files = db.prepare('SELECT id, directory, path FROM local_files').all() as {
        id: string;
        directory: string | null;
        path: string;
      }[];
      const updateStmt = db.prepare('UPDATE local_files SET import_root = ? WHERE id = ?');

      for (const file of files) {
        const root = (file.directory && file.directory.trim()) || path.dirname(file.path) || '';
        updateStmt.run(root, file.id);
      }

      console.log(`[localFiles] Migration complete: set import_root for ${files.length} files`);
    }
  } catch (err) {
    console.error('[localFiles] import_root migration failed:', err);
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

    CREATE INDEX IF NOT EXISTS idx_local_files_import_root
      ON local_files(import_root);
  `);
  
  db.close();
}

export interface LocalFile {
  id: string;
  path: string;
  directory: string; // Parent directory path of the file
  importRoot: string; // Folder import root used for library grouping
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

export interface LocalFolder {
  path: string;
  name: string;
  trackCount: number;
  thumbnail: string;
  addedAt: number;
  totalDuration: number;
  isUngrouped: boolean;
}

function mapRow(row: any): LocalFile | null {
  if (!row) return null;
  return {
    id: row.id,
    path: row.path,
    directory: row.directory ?? path.dirname(row.path ?? ''),
    importRoot: row.import_root ?? '',
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    thumbnail: row.thumbnail,
    trackNumber: row.trackNumber,
    year: row.year,
    genre: row.genre,
    format: row.format,
    fileSize: row.fileSize,
    addedAt: row.addedAt,
    lastScanned: row.lastScanned,
  };
}

export async function scanFile(filePath: string, importRoot?: string): Promise<LocalFile | null> {
  try {
    const parseFile = await getParseFile();

    if (!fs.existsSync(filePath)) {
      console.warn('[localFiles] file does not exist:', filePath);
      return null;
    }

    console.log('[localFiles] scanning file:', filePath);
    const stat = fs.statSync(filePath);

    // Attempt to parse metadata if music-metadata is available, otherwise fall back
    let metadata: any = null;
    if (parseFile) {
      try {
        metadata = await parseFile(filePath);
      } catch (err) {
        console.warn('[localFiles] music-metadata parse failed, falling back to minimal metadata:', err);
        metadata = null;
      }
    } else {
      console.warn('[localFiles] music-metadata not available, falling back to minimal metadata');
    }

    const common = metadata?.common ?? {};
    const format = metadata?.format ?? {};

    const id = crypto.randomUUID();
    const directory = path.dirname(filePath);
    // Folder import: group under the scanned root. Single-file import: ungrouped.
    const resolvedImportRoot =
      importRoot !== undefined ? importRoot : UNGROUPED_IMPORT_ROOT;
    const title = common.title || path.basename(filePath, path.extname(filePath));
    const artist = common.artist || 'Unknown Artist';
    const album = common.album || '';
    let duration = Math.round(format.duration || 0);
    // If music-metadata didn't provide duration, try ffprobe via fluent-ffmpeg as fallback
    if (!duration) {
      try {
        // Lazy-load to avoid hard dependency failures
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffmpeg = require('fluent-ffmpeg');
        const probe = await new Promise<any>((resolve, reject) => {
          ffmpeg.ffprobe(filePath, (err: any, data: any) => (err ? reject(err) : resolve(data)));
        });
        if (probe && probe.format && probe.format.duration) {
          duration = Math.round(probe.format.duration || 0);
        }
      } catch (err) {
        // ignore - ffmpeg/ffprobe may not be available
        console.warn('[localFiles] ffprobe duration fallback failed:', err);
      }
    }
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

    // If no embedded picture, try ffprobe -> ffmpeg extract attached picture as fallback
    if (!thumbnail) {
      try {
        // Use ffprobe to check for attached pictures or video streams
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffmpeg = require('fluent-ffmpeg');

        const probe: any = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(filePath, (err: any, data: any) => (err ? reject(err) : resolve(data)));
        });

        const hasImageStream = (probe?.streams || []).some((s: any) => s.codec_type === 'video' || s.disposition?.attached_pic === 1);
        if (hasImageStream) {
          const tmpFile = path.join(os.tmpdir(), `${crypto.randomUUID()}.jpg`);
          await new Promise<void>((resolve, reject) => {
            ffmpeg(filePath)
              // extract single frame from first video/attached picture stream
              .outputOptions(['-vframes', '1'])
              .output(tmpFile)
              .on('end', () => resolve())
              .on('error', (e: any) => reject(e))
              .run();
          });

          if (fs.existsSync(tmpFile)) {
            try {
              const imgBuf = fs.readFileSync(tmpFile);
              const base64 = imgBuf.toString('base64');
              thumbnail = `data:image/jpeg;base64,${base64}`;
            } finally {
              try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
            }
          }
        }
      } catch (err) {
        console.warn('[localFiles] ffmpeg cover extraction failed:', err);
      }
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM local_files WHERE path = ?').get(filePath) as { id: string } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE local_files SET
          directory = ?, import_root = ?, title = ?, artist = ?, album = ?, duration = ?, thumbnail = ?,
          trackNumber = ?, year = ?, genre = ?, format = ?, fileSize = ?,
          lastScanned = ?
        WHERE path = ?
      `).run(
        directory,
        resolvedImportRoot,
        title,
        artist,
        album,
        duration,
        thumbnail,
        trackNumber,
        year,
        genre,
        audioFormat,
        fileSize,
        Date.now(),
        filePath
      );
      db.close();
      return getLocalFile(existing.id);
    } else {
      const now = Date.now();
      db.prepare(`
        INSERT INTO local_files (id, path, directory, import_root, title, artist, album, duration, thumbnail, trackNumber, year, genre, format, fileSize, addedAt, lastScanned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        filePath,
        directory,
        resolvedImportRoot,
        title,
        artist,
        album,
        duration,
        thumbnail,
        trackNumber,
        year,
        genre,
        audioFormat,
        fileSize,
        now,
        now
      );
      db.close();
      return getLocalFile(id);
    }
  } catch (err) {
    console.error('[localFiles] scan failed for', filePath, err);
    return null;
  }
}

export async function scanDirectory(dirPath: string): Promise<{ scanned: number; failed: number; importRoot: string }> {
  let scanned = 0;
  let failed = 0;

  const audioExtensions = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.webm']);
  const importRoot = path.resolve(dirPath);

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
          // All files under this scan share the same library folder
          const result = await scanFile(fullPath, importRoot);
          if (result) {
            scanned++;
          } else {
            failed++;
          }
        }
      }
    }
  }

  await walk(importRoot);
  return { scanned, failed, importRoot };
}

export function getLocalFile(id: string): LocalFile | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM local_files WHERE id = ?').get(id) as any;
  db.close();
  return mapRow(row);
}

export function getLibrary(
  limit = 50,
  offset = 0,
  importRoot?: string | null
): { files: LocalFile[]; total: number } {
  const db = getDb();

  if (importRoot !== undefined && importRoot !== null) {
    const files = (
      db
        .prepare(
          'SELECT * FROM local_files WHERE import_root = ? ORDER BY trackNumber, title COLLATE NOCASE LIMIT ? OFFSET ?'
        )
        .all(importRoot, limit, offset) as any[]
    )
      .map(mapRow)
      .filter(Boolean) as LocalFile[];
    const total = (
      db.prepare('SELECT COUNT(*) as count FROM local_files WHERE import_root = ?').get(importRoot) as {
        count: number;
      }
    ).count;
    db.close();
    return { files, total };
  }

  const files = (
    db.prepare('SELECT * FROM local_files ORDER BY addedAt DESC LIMIT ? OFFSET ?').all(limit, offset) as any[]
  )
    .map(mapRow)
    .filter(Boolean) as LocalFile[];
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

export function deleteFolder(importRoot: string): number {
  const db = getDb();
  const result = db.prepare('DELETE FROM local_files WHERE import_root = ?').run(importRoot);
  db.close();
  return result.changes;
}

export function getFolders(): LocalFolder[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        import_root as path,
        COUNT(*) as trackCount,
        MAX(addedAt) as addedAt,
        SUM(duration) as totalDuration,
        (
          SELECT thumbnail FROM local_files lf2
          WHERE lf2.import_root = lf.import_root
            AND lf2.thumbnail IS NOT NULL
            AND lf2.thumbnail != ''
          ORDER BY lf2.trackNumber, lf2.title
          LIMIT 1
        ) as thumbnail
      FROM local_files lf
      GROUP BY import_root
      ORDER BY
        CASE WHEN import_root = '' OR import_root IS NULL THEN 1 ELSE 0 END,
        MAX(addedAt) DESC
    `
    )
    .all() as {
    path: string | null;
    trackCount: number;
    addedAt: number;
    totalDuration: number;
    thumbnail: string | null;
  }[];
  db.close();

  return rows.map((row) => {
    const folderPath = row.path ?? '';
    return {
      path: folderPath,
      name: folderDisplayName(folderPath),
      trackCount: row.trackCount,
      thumbnail: row.thumbnail || '',
      addedAt: row.addedAt || 0,
      totalDuration: row.totalDuration || 0,
      isUngrouped: !folderPath,
    };
  });
}

export function getDirectories(): string[] {
  return getFolders()
    .filter((f) => !f.isUngrouped)
    .map((f) => f.path);
}

export function getFilesByDirectory(directory: string): LocalFile[] {
  const db = getDb();
  // Prefer import_root grouping; fall back to immediate parent directory for compatibility
  const files = (
    db
      .prepare(
        `SELECT * FROM local_files
         WHERE import_root = ? OR directory = ?
         ORDER BY trackNumber, title COLLATE NOCASE`
      )
      .all(directory, directory) as any[]
  )
    .map(mapRow)
    .filter(Boolean) as LocalFile[];
  db.close();
  return files;
}

export function getFilesByImportRoot(importRoot: string): LocalFile[] {
  const db = getDb();
  const files = (
    db
      .prepare('SELECT * FROM local_files WHERE import_root = ? ORDER BY trackNumber, title COLLATE NOCASE')
      .all(importRoot) as any[]
  )
    .map(mapRow)
    .filter(Boolean) as LocalFile[];
  db.close();
  return files;
}
