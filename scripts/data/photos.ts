/**
 * Real Perseverance raw images → public/data/rovers/*.jpg + photos.json (RoverPhoto[]).
 * Feed: https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json
 * Position: each raw image carries (site, drive); the MMGIS waypoint with the same RMC (site_drive)
 * gives the rover lat/lng (approximatePosition=false). Fallback: last waypoint at or before the sol.
 */
import { join } from 'node:path';
import { writeFile, stat, readdir, unlink } from 'node:fs/promises';
import sharp from 'sharp';
import { PUB, RAW, distM, ensureDir, exists, fetchBuf, readJson, writeJson } from './lib';
import { loadM20 } from './track';
import { LANDMARKS } from './vectors';
import type { RoverPhoto } from '../../src/core/types';

const API = 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&extended=sample_type::full,';
/** Sols chosen near the base (landing site) and along the way to / at the delta front. */
const SOLS = [16, 28, 46, 102, 152, 204, 285, 363, 415, 437, 464, 592, 640, 706, 762];
const CAMS: Record<string, string> = {
  MCZ_LEFT: 'Mastcam-Z esquerda', MCZ_RIGHT: 'Mastcam-Z direita',
  NAVCAM_LEFT: 'Navcam esquerda', NAVCAM_RIGHT: 'Navcam direita',
};

type RawImg = {
  imageid: string; sol: number; site: number; drive: string; caption: string; sample_type: string;
  image_files: { medium?: string; large?: string };
  camera: { instrument: string };
  extended: { mastEl?: string; dimension?: string; subframeRect?: string };
};
type WP = { RMC: string; site: number; drive: number; sol: number; lat: number; lon: number };

async function solImages(sol: number): Promise<RawImg[]> {
  const cache = join(RAW, 'rawimg', `sol_${sol}.json`);
  if (await exists(cache)) return readJson<RawImg[]>(cache);
  const all: RawImg[] = [];
  for (let page = 0; page < 4; page++) {
    const url = `${API}&num=100&page=${page}&order=sol+asc&condition_2=${sol}:sol:gte&condition_3=${sol}:sol:lte`;
    const j = JSON.parse((await fetchBuf(url, 60000)).toString('utf8')) as { images: RawImg[] };
    all.push(...j.images);
    if (j.images.length < 100) break;
  }
  await ensureDir(join(RAW, 'rawimg'));
  await writeFile(cache, JSON.stringify(all));
  return all;
}

function score(im: RawImg): number {
  if (!CAMS[im.camera.instrument] || !im.image_files.medium) return -1;
  const dim = im.extended.dimension?.match(/\((\d+),(\d+)\)/);
  if (!dim) return -1;
  const w = +dim[1], h = +dim[2];
  if (w < 1000 || h / w < 0.5) return -1; // skip thumbnails / thin subframes
  const el = parseFloat(im.extended.mastEl ?? 'NaN');
  if (!Number.isFinite(el) || el < -14 || el > 8) return -1; // want horizon / landscape views
  const mcz = im.camera.instrument.startsWith('MCZ');
  let s = 10 - Math.abs(el - (mcz ? -3 : -8)); // Navcam: look a bit down to avoid sky-only frames
  if (mcz) s += 8;
  if (im.imageid[2] === 'F') s += 6; // colour product (e.g. NLF_, ZLF_) per M20 image-id convention
  if (im.camera.instrument.endsWith('LEFT')) s += 1;
  return s;
}

function nearestPlace(lat: number, lng: number) {
  let best = LANDMARKS[0], bd = Infinity;
  for (const l of LANDMARKS) {
    const d = distM(lat, lng, l.lat, l.lng);
    if (d < bd) { bd = d; best = l; }
  }
  return { name: best.name, d: bd };
}

export async function buildPhotos() {
  console.log('[photos] Perseverance raw images');
  const wps = (await readJson<{ features: { properties: WP }[] }>(await loadM20('M20_waypoints'))).features.map((f) => f.properties);
  const byRmc = new Map(wps.map((w) => [`${w.site}_${w.drive}`, w]));
  const dir = join(PUB, 'rovers');
  await ensureDir(dir);
  const photos: RoverPhoto[] = [];
  for (const sol of SOLS) {
    let imgs: RawImg[] = [];
    try { imgs = await solImages(sol); } catch (e) { console.warn('  feed failed sol', sol, (e as Error).message); continue; }
    const ranked = imgs.map((im) => ({ im, s: score(im) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    let done = false;
    for (const { im } of ranked.slice(0, 6)) {
      try {
        const buf = await fetchBuf(im.image_files.medium!, 60000);
        let out = buf;
        if (buf.length > 400 * 1024) out = await sharp(buf).jpeg({ quality: 78 }).toBuffer();
        const meta = await sharp(out).metadata();
        if ((meta.width ?? 0) < 600) continue;
        const file = `m20_sol${String(sol).padStart(4, '0')}_${im.imageid.slice(0, 3).toLowerCase()}.jpg`;
        await writeFile(join(dir, file), out);
        const wp = byRmc.get(`${im.site}_${im.drive}`);
        const fallback = [...wps].filter((w) => w.sol <= sol).pop() ?? wps[0];
        const pos = wp ?? fallback;
        const place = nearestPlace(pos.lat, pos.lon);
        const where = place.d < 600 ? `perto de ${place.name}` : `a ${(place.d / 1000).toFixed(1)} km de ${place.name}`;
        photos.push({
          id: `m20-sol${sol}`,
          src: `/data/rovers/${file}`,
          lat: Math.round(pos.lat * 1e5) / 1e5,
          lng: Math.round(pos.lon * 1e5) / 1e5,
          sol,
          camera: CAMS[im.camera.instrument],
          caption: `Sol ${sol}: vista do Perseverance ${where}. (${im.imageid})`,
          credit: 'NASA/JPL-Caltech',
          approximatePosition: !wp,
        });
        console.log(`  sol ${sol}: ${file} ${(out.length / 1024).toFixed(0)} KB ${im.camera.instrument} ${wp ? 'RMC ' + wp.RMC : 'approx'}`);
        done = true;
        break;
      } catch (e) {
        console.warn('  download failed', im.imageid, (e as Error).message);
      }
    }
    if (!done) console.warn(`  sol ${sol}: no suitable image (${imgs.length} in feed)`);
  }
  // remove stale jpgs not referenced anymore
  const keep = new Set(photos.map((p) => p.src.split('/').pop()));
  for (const f of await readdir(dir)) if (f.endsWith('.jpg') && !keep.has(f)) await unlink(join(dir, f));
  await writeJson('photos.json', photos, true);
  let total = 0;
  for (const p of photos) total += (await stat(join(dir, p.src.split('/').pop()!))).size;
  console.log(`  ${photos.length} photos, ${(total / 1048576).toFixed(1)} MB`);
}

if (require.main === module) buildPhotos().catch((e) => { console.error(e); process.exit(1); });
