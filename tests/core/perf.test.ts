import { describe, expect, it } from 'vitest';
import { buildCostField, getFeatures } from '@/core/costMap';
import { astar } from '@/core/astar';
import { planRoutes } from '@/core';
import { at, fullSuit, mapData } from './helpers';

describe('desempenho', () => {
  it('A* numa grade 250×240 < 500 ms', () => {
    const W = 250;
    const H = 240;
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const data = mapData({ w: W, h: H, slope: (r, c) => (r % 40 === 20 && c % 50 > 5 ? 35 : rnd() * 20) });
    const f = getFeatures(data);
    const field = buildCostField(f, { wSlope: 2, wHazard: 10, wClear: 4, wCold: 1, wHeat: 1, wTrack: 0.4, nodataPenalty: 0.5 }, 'day');
    const t0 = performance.now();
    const res = astar({
      width: W, height: H, cellWM: f.cellWM, cellHM: f.cellHM, cost: field.cost,
      minFactor: field.minFactor, start: 0, goal: W * H - 1,
    });
    const ms = performance.now() - t0;
    console.log(`A* 250×240: ${ms.toFixed(1)} ms, ${res.expanded} expandidas, ${res.path.length} células`);
    expect(res.path.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(500);
    const t1 = performance.now();
    planRoutes(at(5, 5, W, H), at(235, 245, W, H), data, fullSuit, 'night');
    console.log(`planRoutes (3 perfis) 250×240: ${(performance.now() - t1).toFixed(1)} ms`);
  });
});
