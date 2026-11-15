/**
 * Science stops in the CTX area → public/data/science-targets.json (ScienceTarget[]).
 * Positions: Perseverance localized waypoints (MMGIS M20_waypoints.json) at the sampling sols
 * (last localization at or before that sol), the CRISM FRT00005C5E carbonate browse, or CTX.
 * Sample names/sols follow NASA/JPL Perseverance sample announcements; sols are approximate (±few sols),
 * and the waypoint is the rover's end-of-drive position, so stops are accurate to ~tens of metres.
 * MMGIS has no public samples layer (HTTP 403), hence the waypoint lookup.
 */
import { join } from 'node:path';
import { BASE, DEMO_TARGET } from '../../src/config/mission';
import { PUB, distM, distToSegM, exists, readJson, round, writeJson } from './lib';
import { loadWaypoints, type Waypoint } from './track';
import type { RoverPhoto, ScienceTarget } from '../../src/core/types';

type Def = Omit<ScienceTarget, 'lat' | 'lng' | 'photoId'> & ({ sol: number } | { at: [number, number] });

const WP = 'Perseverance waypoint (NASA/JPL MMGIS M20_waypoints.json)';

const DEFS: Def[] = [
  {
    id: 'sid-maaz', sol: 371, kind: 'sample-site', priority: 2, workMin: 15,
    name: 'Sid (amostras Hahonih e Atsah)', nameEn: 'Sid (Hahonih & Atsah samples)',
    why: 'Rocha vulcânica da formação Máaz, perto da base: registra a lava que cobriu o fundo do lago e foi alterada pela água.',
    whyEn: 'Máaz volcanic rock next to the base: records the lava that floored the lake and was later altered by water.',
    task: 'Fotografar a superfície abradida e coletar um núcleo de referência.', taskEn: 'Photograph the abraded patch and collect a reference core.',
    source: `${WP}, sol ~371 (Sid sampling, Máaz formation)`,
  },
  {
    id: 'floor-contact', at: [18.4512, 77.4282], kind: 'stratigraphy', priority: 3, workMin: 10,
    name: 'Contato no assoalho (canal sinuoso)', nameEn: 'Crater-floor contact (sinuous trough)',
    why: 'A borda do canal expõe o contato entre o assoalho vulcânico e sedimentos mais novos: mostra a ordem dos eventos.',
    whyEn: 'The trough edge exposes the contact between volcanic floor and younger sediments, showing the order of events.',
    task: 'Fotografar o contato e medir a espessura da camada.', taskEn: 'Photograph the contact and measure the layer thickness.',
    source: 'Digitized on USGS CTX orthomosaic where the base→delta-front corridor crosses the floor trough (interpretation approximate)',
  },
  {
    id: 'hawksbill-samples', sol: 501, kind: 'sample-site', priority: 1, workMin: 30,
    name: 'Skinner Ridge e Wildcat Ridge (Hawksbill Gap)', nameEn: 'Skinner Ridge & Wildcat Ridge (Hawksbill Gap)',
    why: 'Lamito com sulfatos e moléculas orgânicas (Wildcat Ridge) e arenito do delta: o melhor lugar para buscar bioassinaturas.',
    whyEn: 'Sulfate-rich mudstone with organic molecules (Wildcat Ridge) plus delta sandstone: the best spot to look for biosignatures.',
    task: 'Coletar núcleo do lamito e registrar as camadas da frente do delta.', taskEn: 'Core the mudstone and log the delta-front layers.',
    source: `${WP}, sols ~490-516 (Skinner Ridge: Swift Run/Skyland; Wildcat Ridge: Hazeltop/Bearwallow)`,
  },
  {
    id: 'enchanted-lake', at: [18.4494, 77.4052], kind: 'stratigraphy', priority: 2, workMin: 15,
    name: 'Enchanted Lake', nameEn: 'Enchanted Lake',
    why: 'Primeiro afloramento da base da escarpa do delta: camadas finas depositadas em água parada.',
    whyEn: 'First outcrop at the foot of the delta scarp: thin beds laid down in still lake water.',
    task: 'Fotografar as camadas de perto (escala) e de longe (contexto).', taskEn: 'Photograph the beds close up (scale) and from afar (context).',
    source: `${WP}, sol ~415 (Enchanted Lake, delta front)`,
  },
  {
    id: 'three-forks', at: [18.4514, 77.4013], kind: 'sample-site', priority: 2, workMin: 20,
    name: 'Depósito Three Forks', nameEn: 'Three Forks sample depot',
    why: 'Dez tubos de amostras deixados no chão para uma futura missão de retorno: verificar estado e posição.',
    whyEn: 'Ten sample tubes left on the surface for a future return mission: check their condition and position.',
    task: 'Inspecionar e fotografar cada tubo, sem tocar.', taskEn: 'Inspect and photograph each tube without touching it.',
    source: `${WP}, sols 586-653 (Three Forks depot)`,
  },
  {
    id: 'rochette', sol: 190, kind: 'sample-site', priority: 2, workMin: 20,
    name: 'Rochette (Montdenier e Montagnac)', nameEn: 'Rochette (Montdenier & Montagnac)',
    why: 'Primeiro núcleo bem-sucedido do Perseverance: basalto de Máaz com sais, sinal de água subterrânea.',
    whyEn: "Perseverance's first successful cores: Máaz basalt with salts, a sign of groundwater.",
    task: 'Comparar a rocha com a amostra de Sid e fotografar os sais.', taskEn: 'Compare the rock with the Sid sample and photograph the salts.',
    source: `${WP}, sols ~190-196 (Rochette on Artuby ridge, Máaz)`,
  },
  {
    id: 'brac-seitah', sol: 262, kind: 'olivine', priority: 1, workMin: 25,
    name: 'Brac (Salette e Coulettes), Séítah', nameEn: 'Brac (Salette & Coulettes), Séítah',
    why: 'Rocha rica em olivina formada em magma espesso e depois alterada pela água: guarda a história do lago.',
    whyEn: 'Olivine-rich rock from a thick magma body, later altered by water: it holds the lake history.',
    task: 'Coletar núcleo na borda leste de Séítah, longe das dunas.', taskEn: 'Core it on the east edge of Séítah, away from the dunes.',
    source: `${WP}, sols ~262-271 (Brac, Séítah formation)`,
  },
  {
    id: 'issole-seitah', sol: 337, kind: 'olivine', priority: 3, workMin: 15,
    name: 'Issole (Robine e Malay), Séítah', nameEn: 'Issole (Robine & Malay), Séítah',
    why: 'Segunda rocha de olivina de Séítah: confirma se a alteração por água é a mesma em toda a unidade.',
    whyEn: 'Second Séítah olivine rock: checks whether the water alteration is the same across the unit.',
    task: 'Abradir e comparar com Brac.', taskEn: 'Abrade it and compare with Brac.',
    source: `${WP}, sols ~337-347 (Issole, Séítah formation)`,
  },
  {
    id: 'belva-layers', sol: 755, kind: 'stratigraphy', priority: 2, workMin: 20,
    name: 'Camadas da cratera Belva', nameEn: 'Belva crater layers',
    why: 'O impacto cortou o delta e expôs dezenas de metros de camadas inclinadas: um corte natural do rio antigo.',
    whyEn: 'The impact cut through the delta and exposed tens of metres of inclined beds: a natural section of the ancient river.',
    task: 'Panorama das paredes a partir da borda sul; não descer.', taskEn: 'Shoot a panorama of the walls from the south rim; do not descend.',
    source: `${WP}, sols ~753-760 (Belva crater rim, delta top)`,
  },
  {
    id: 'delta-boulders', sol: 1000, kind: 'boulder', priority: 3, workMin: 15,
    name: 'Blocos e conglomerados do topo do delta', nameEn: 'Delta-top boulders and conglomerates',
    why: 'Blocos trazidos pelo rio de fora da cratera: amostram rochas de toda a bacia de drenagem.',
    whyEn: 'Boulders carried in by the river from outside the crater: they sample rocks from the whole watershed.',
    task: 'Fotografar 3 blocos de cores diferentes com escala.', taskEn: 'Photograph three boulders of different colours with scale.',
    source: `${WP}, sol ~1000 (upper fan, boulder-rich delta top); boulder identification approximate`,
  },
  {
    id: 'margin-carbonate', at: [18.4679, 77.338], kind: 'carbonate', priority: 1, workMin: 25,
    name: 'Carbonatos da margem (CRISM)', nameEn: 'Margin carbonates (CRISM)',
    why: 'Carbonatos formados na beira do lago: na Terra, esse ambiente preserva bem sinais de vida.',
    whyEn: 'Carbonates formed at the lake shore: on Earth, this setting preserves signs of life well.',
    task: 'Confirmar o carbonato com o espectrômetro e coletar núcleo.', taskEn: 'Confirm the carbonate with the spectrometer and collect a core.',
    source: 'CRISM FRT00005C5E CAR browse (PDS MTRDR): centroid of the southern strong-carbonate patch on the western margin',
  },
];

export async function buildScience() {
  console.log('[science] science targets');
  const wps = (await loadWaypoints()).sort((a, b) => a.sol - b.sol);
  const at = (sol: number): Waypoint => [...wps].filter((w) => w.sol <= sol).pop() ?? wps[0];
  const photosPath = join(PUB, 'photos.json');
  const photos = (await exists(photosPath)) ? await readJson<RoverPhoto[]>(photosPath) : [];
  const out: ScienceTarget[] = DEFS.map((d) => {
    const [lat, lng] = 'sol' in d ? [at(d.sol).lat, at(d.sol).lng] : d.at;
    let photoId: string | undefined, best = 300;
    for (const p of photos) {
      const dd = distM(lat, lng, p.lat, p.lng);
      if (dd < best) { best = dd; photoId = p.id; }
    }
    const { sol: _s, at: _a, ...rest } = d as Def & { sol?: number; at?: unknown };
    void _s; void _a;
    return { ...rest, lat: round(lat, 5), lng: round(lng, 5), ...(photoId ? { photoId } : {}) };
  });
  for (const t of out) {
    const corr = distToSegM(t.lat, t.lng, [BASE.lat, BASE.lng], [DEMO_TARGET.lat, DEMO_TARGET.lng]);
    console.log(`  ${t.id.padEnd(18)} ${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}  corridor ${Math.round(corr)} m  ${t.photoId ?? ''}`);
  }
  await writeJson('science-targets.json', out, true);
  return out;
}

if (require.main === module) buildScience().catch((e) => { console.error(e); process.exit(1); });
