// Verify that every local asset referenced by songs.json actually exists.
// Run from the repo root:  node tools/check-assets.mjs
import { readFileSync, existsSync } from 'node:fs';

const data = JSON.parse(readFileSync('songs.json', 'utf8'));
const isRemote = (p) => /^https?:\/\//.test(p);
const missing = [];

for (const [slug, song] of Object.entries(data.songs || {})) {
  for (const loop of song.loops || []) {
    if (loop.score && !isRemote(loop.score) && !existsSync(loop.score)) {
      missing.push(`${slug}: ${loop.score}`);
    }
  }
  if (song.audio && !isRemote(song.audio) && !existsSync(song.audio)) {
    missing.push(`${slug}: ${song.audio}`);
  }
}

if (missing.length) {
  console.error('Missing referenced assets:');
  for (const m of missing) console.error('  - ' + m);
  process.exit(1);
}
console.log('All referenced assets exist.');
