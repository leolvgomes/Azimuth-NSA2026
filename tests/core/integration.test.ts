import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, DEMO_TARGET } from '@/config/mission';
import { initialSuitState } from '@/config/suit';
import { buildDossier, computeRescue, oxygenMargin, planRoutes, pointOfNoReturn } from '@/core';
import { loadMapData } from '@/data/loadMapData';

const has = existsSync(join(process.cwd(), 'public', 'data', 'grids', 'slope.json'));

describe.skipIf(!has)('integração com public/data', () => {
  it('base → DEMO_TARGET com dados reais', async () => {
    const data = await loadMapData();
    const suit = { ...initialSuitState };
    for (const tod of ['day', 'night'] as const) {
      const t0 = performance.now();
      const routes = planRoutes(BASE, DEMO_TARGET, data, suit, tod);
      const ms = performance.now() - t0;
      expect(routes.length).toBe(3);
      const lines = [`[${tod}] grade ${data.grids.slope.width}×${data.grids.slope.height}, planRoutes ${ms.toFixed(0)} ms`];
      for (const r of routes) {
        const m = oxygenMargin(r, suit);
        lines.push(`  ${r.label.padEnd(12)} ${(r.distanceM / 1000).toFixed(2)} km  ${r.durationMin.toFixed(0)} min  ` +
          `O2 usado ${r.o2UsedPct.toFixed(1)}%  sobra ${r.o2RemainingPct.toFixed(1)}%  incl.max ${r.maxSlopeDeg.toFixed(1)}°  ` +
          `margem ${m.marginPct.toFixed(1)}%  PNR ${JSON.stringify(pointOfNoReturn(r, suit))}  pts ${r.points.length}`);
        for (const a of r.alerts) lines.push(`    [${a.severity}] ${a.kind} ${a.title} (${a.fromIdx}-${a.toIdx}) → ${a.action}`);
      }
      if (tod === 'day') {
        for (const e of buildDossier(routes[0], data, tod).entries) lines.push(`  · ${e.label}: ${e.value} [${e.source}]`);
        const r = routes[1];
        const k = Math.floor(r.points.length / 2);
        const plan = computeRescue(r.points[k], k, r, data, { ...suit, o2Pct: 50 }, tod);
        lines.push(`  resgate: ${plan.shelter.name} ETA ${plan.etaMin.toFixed(0)} min, O2 ${plan.o2NeededPct.toFixed(1)}% ok=${plan.ok}`);
      }
      console.log(lines.join('\n'));
    }
  }, 30000);
});
