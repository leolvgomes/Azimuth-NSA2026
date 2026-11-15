/** Number formatting per language (LOCALE from @/config/i18n). English is the default. */
import { DEFAULT_LANG, LOCALE, type Lang } from '@/config/i18n';

const nfCache = new Map<string, Intl.NumberFormat>();

export function fmt(v: number, digits = 0, lang: Lang = DEFAULT_LANG): string {
  if (!Number.isFinite(v)) return '—';
  const key = `${lang}|${digits}`;
  let nf = nfCache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(LOCALE[lang] ?? LOCALE.en, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    nfCache.set(key, nf);
  }
  // evita "-0"
  const out = nf.format(v);
  return /^-0([.,]0*)?$/.test(out) ? out.slice(1) : out;
}

export function fmtDist(m: number, lang: Lang = DEFAULT_LANG): string {
  return m >= 1000 ? `${fmt(m / 1000, 1, lang)} km` : `${fmt(m, 0, lang)} m`;
}

export function fmtDuration(min: number): string {
  if (!Number.isFinite(min)) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
