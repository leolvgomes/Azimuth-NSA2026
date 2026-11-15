/**
 * Tutorial interativo: todo passo tem texto nos dois idiomas, todo alvo existe como data-tour em algum
 * componente (evita quebrar o tour ao renomear um elemento) e as condições de conclusão fazem sentido.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { aboutCopy, team, tourCopy } from '@/config/about';
import { TOUR_STEPS } from '@/components/guide/tourSteps';
import type { AzimuthState } from '@/state/store';

function sources(dir: string): string {
  let out = '';
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out += sources(p);
    else if (p.endsWith('.tsx')) out += readFileSync(p, 'utf8');
  }
  return out;
}
const code = sources(join(process.cwd(), 'src', 'components'));

/** Alvos podem vir de data-tour="x", tour="x" (Hud) ou data-tour={`layer-${id}`}. */
function anchored(target: string): boolean {
  if (code.includes(`data-tour="${target}"`) || code.includes(`tour="${target}"`)) return true;
  if (target.startsWith('layer-')) return code.includes('data-tour={`layer-${g.id}`}');
  return false;
}

describe('tour steps', () => {
  it('every step has copy in English and Portuguese', () => {
    for (const s of TOUR_STEPS) {
      expect(tourCopy.en.steps[s.id], `en:${s.id}`).toBeTruthy();
      expect(tourCopy.pt.steps[s.id], `pt:${s.id}`).toBeTruthy();
      if (s.done) {
        expect(tourCopy.en.steps[s.id].task, `task en:${s.id}`).toBeTruthy();
        expect(tourCopy.pt.steps[s.id].task, `task pt:${s.id}`).toBeTruthy();
      }
    }
  });

  it('every target is anchored in a component', () => {
    for (const s of TOUR_STEPS) if (s.target) expect(anchored(s.target), s.target).toBe(true);
  });

  it('completion conditions react to the right state changes', () => {
    const st = (p: Partial<AzimuthState>) => ({ zoom: 12, layers: { thermal: false }, timeOfDay: 'day', routes: [], activeRouteId: null,
      suit: { o2Pct: 72, batteryPct: 64, suitTempC: 18 }, mode: 'plan', sim: { running: false, elapsedMin: 0 }, ...p }) as unknown as AzimuthState;
    const step = (id: string) => TOUR_STEPS.find((s) => s.id === id)!;
    const snap = st({});
    expect(step('map').done!(st({ zoom: 13 }), snap)).toBe(true);
    expect(step('map').done!(st({}), snap)).toBe(false);
    expect(step('layers').done!(st({ layers: { thermal: true } } as Partial<AzimuthState>), snap)).toBe(true);
    expect(step('night').done!(st({ timeOfDay: 'night' }), snap)).toBe(true);
    expect(step('options').done!(st({ activeRouteId: 'b' }), st({ activeRouteId: 'a' }))).toBe(true);
    expect(step('options').done!(st({ activeRouteId: 'a' }), st({ activeRouteId: 'a' }))).toBe(false);
    expect(step('suit').done!(st({ suit: { o2Pct: 60, batteryPct: 64, suitTempC: 18 } }), snap)).toBe(true);
    expect(step('walk').done!(st({ mode: 'walk' }), snap)).toBe(true);
    expect(step('rescue').done!(st({ mode: 'rescue' }), snap)).toBe(true);
  });
});

describe('about content', () => {
  it('has the same structure in both languages', () => {
    expect(aboutCopy.en.sections.length).toBe(aboutCopy.pt.sections.length);
    expect(aboutCopy.en.data.items.length).toBe(aboutCopy.pt.data.items.length);
    expect(aboutCopy.en.how.steps.length).toBe(aboutCopy.pt.how.steps.length);
    expect(aboutCopy.en.why.checklist.length).toBe(aboutCopy.pt.why.checklist.length);
  });

  it('team has three members with roles in both languages', () => {
    expect(team).toHaveLength(3);
    for (const m of team) {
      expect(m.role.en && m.role.pt).toBeTruthy();
      expect(m.focus.en.length).toBe(m.focus.pt.length);
    }
  });
});
