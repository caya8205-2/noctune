import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export interface SeedTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  playCount: number;
  spotifyId?: string;
  youtubeId?: string;
}

export interface SeedModelFile {
  version: number;
  trainedAt: number;
  trackCount: number;
  tracks: Record<string, SeedTrack>;
  transitions: Record<string, Record<string, number>>;
}

function trainSeedModel() {
  console.log('[ml-trainer] Starting model training...');

  // Locate input data
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '');
  const candidatePaths = [
    'C:\\Users\\Caya\\AppData\\Roaming\\dev.noctune.desktop\\songs.json',
    path.join(appData, 'dev.noctune.desktop', 'songs.json'),
    path.join(process.cwd(), 'data', 'songs.json'),
    path.join(process.cwd(), 'backend', 'data', 'songs.json'),
  ];

  let sourceFile = '';
  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) {
      sourceFile = p;
      break;
    }
  }

  if (!sourceFile) {
    console.error('[ml-trainer] Error: No songs.json found to train from.');
    process.exit(1);
  }

  console.log(`[ml-trainer] Reading source data from: ${sourceFile}`);
  const raw = fs.readFileSync(sourceFile, 'utf-8');
  const sourceData = JSON.parse(raw) as { tracks: Record<string, any> };
  const rawTracks = Object.values(sourceData.tracks || {});

  const seedTracks: Record<string, SeedTrack> = {};
  const transitions: Record<string, Record<string, number>> = {};
  let totalPlays = 0;

  const validTracks = rawTracks.filter((t) => t && t.id && t.title && t.artist);

  validTracks.forEach((t) => {
    seedTracks[t.id] = {
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration,
      playCount: t.playCount ?? 1,
      spotifyId: t.spotifyId,
      youtubeId: t.youtubeId,
    };
    totalPlays += t.playCount ?? 1;
  });

  // Build pairwise similarity/transition graph based on shared artist / album clustering
  const trackIds = Object.keys(seedTracks);
  for (let i = 0; i < trackIds.length; i++) {
    const idA = trackIds[i];
    const trackA = seedTracks[idA];
    transitions[idA] = {};

    for (let j = 0; j < trackIds.length; j++) {
      if (i === j) continue;
      const idB = trackIds[j];
      const trackB = trackIds[j] ? seedTracks[idB] : undefined;
      if (!trackB) continue;

      let weight = 0;
      if (trackA.artist && trackB.artist && trackA.artist.toLowerCase() === trackB.artist.toLowerCase()) {
        weight += 0.7;
      }
      if (trackA.album && trackB.album && trackA.album.toLowerCase() === trackB.album.toLowerCase()) {
        weight += 0.3;
      }

      if (weight > 0) {
        transitions[idA][idB] = Math.round(weight * 10) / 10;
      }
    }
  }

  const modelOutput: SeedModelFile = {
    version: 1,
    trainedAt: Date.now(),
    trackCount: Object.keys(seedTracks).length,
    tracks: seedTracks,
    transitions,
  };

  const outputDir = path.join(process.cwd(), 'src', 'data');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, 'seed-model.json');

  fs.writeFileSync(outputFile, JSON.stringify(modelOutput, null, 2), 'utf-8');
  console.log(`[ml-trainer] Success! Model trained with ${modelOutput.trackCount} tracks and exported to ${outputFile}`);
}

trainSeedModel();
