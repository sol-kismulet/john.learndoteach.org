// Bundle a single song into its own standalone static site.
//
//   node tools/export.mjs <slug> <dest-dir>
//   e.g. node tools/export.mjs allemande ../bach-site
//
// Copies the shared template/engine/styles plus only the assets the chosen
// song references (scores, local audio), and writes a songs.json containing
// just that song. The result is a self-contained site you can deploy
// anywhere (set its own CNAME afterwards).
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [slug, dest] = process.argv.slice(2);
if (!slug || !dest) {
  console.error('usage: node tools/export.mjs <slug> <dest-dir>');
  process.exit(1);
}

const data = JSON.parse(readFileSync('songs.json', 'utf8'));
const song = (data.songs || {})[slug];
if (!song) {
  console.error(`song "${slug}" not found in songs.json`);
  process.exit(1);
}

const isRemote = (p) => /^https?:\/\//.test(p);

function copyInto(relPath) {
  if (!relPath || isRemote(relPath)) return;
  if (!existsSync(relPath)) {
    console.warn(`  ! skipped missing: ${relPath}`);
    return;
  }
  const out = join(dest, relPath);
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(relPath, out);
  console.log(`  + ${relPath}`);
}

mkdirSync(dest, { recursive: true });

// Shared site files (only those that exist).
const shared = ['song.html', 'song.js', 'song.css', 'index.html', 'feather.svg', '.nojekyll', 'john.html'];
for (const f of shared) if (existsSync(f)) copyInto(f);

// Per-song assets referenced from the song entry.
for (const loop of song.loops || []) copyInto(loop.score);
copyInto(song.audio);

// Filtered data file: keep the cheat sheet, drop other songs.
const exported = { _format: data._format, concerts: {}, songs: { [slug]: song } };
writeFileSync(join(dest, 'songs.json'), JSON.stringify(exported, null, 2) + '\n');
console.log(`  + songs.json (only "${slug}")`);

console.log(`\nExported "${slug}" to ${dest}`);
console.log(`Open ${join(dest, 'song.html')}?s=${slug} (or the index).`);
