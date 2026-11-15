/** Formatação de números para a UI (sem cálculo de segurança: isso é do core). */
import type { LatLng } from '@/core/types';
import { DEFAULT_LANG, LOCALE, type Lang } from '@/config/i18n';

/** Idioma dos números (o store chama setFormatLang ao trocar de idioma). */
let fmtLang: Lang = DEFAULT_LANG;
export function setFormatLang(l: Lang) {
  fmtLang = l;
}
export function getFormatLang(): Lang {
  return fmtLang;
}

const nf = (d: number) => new Intl.NumberFormat(LOCALE[fmtLang], { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmtNum(v: number, digits = 0): string {
  return nf(digits).format(v);
}

export function fmtKm(m: number | null | undefined, digits = 1): string {
  if (m == null || !Number.isFinite(m)) return '—';
  return `${nf(digits).format(m / 1000)} km`;
}

export function fmtDist(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  if (Math.abs(m) < 1000) return `${Math.round(m)} m`;
  return fmtKm(m);
}

export function fmtDuration(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, '0')}`;
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${Math.round(v)}%`;
}

export function fmtTemp(c: number | null | undefined): string {
  if (c == null || !Number.isFinite(c)) return '—';
  const r = Math.round(c);
  return `${r < 0 ? '−' : r > 0 ? '+' : ''}${Math.abs(r)} °C`;
}

export function fmtDeg(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${Math.round(v)}°`;
}

export function fmtLatLng(p: LatLng | null | undefined, digits = 4): string {
  if (!p) return '—';
  const lat = `${Math.abs(p.lat).toFixed(digits)}° ${p.lat >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(p.lng).toFixed(digits)}° ${p.lng >= 0 ? 'E' : 'W'}`;
  return `${lat} · ${lng}`;
}

/** Rumo inicial (graus a partir do norte) e ponto cardeal: só orientação, não segurança. */
export function bearing(a: LatLng, b: LatLng): { deg: number; cardinal: string } {
  const toR = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toR(b.lng - a.lng)) * Math.cos(toR(b.lat));
  const x = Math.cos(toR(a.lat)) * Math.sin(toR(b.lat)) - Math.sin(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.cos(toR(b.lng - a.lng));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const names = fmtLang === 'en' ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] : ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  return { deg, cardinal: names[Math.round(deg / 45) % 8] };
}

export function upper(s: string): string {
  return s.toLocaleUpperCase(LOCALE[fmtLang]);
}

/** Relógio de missão: 'T+1:05' (h:mm). */
export function fmtClock(min: number): string {
  const m = Math.max(0, Math.floor(min));
  return `T+${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
