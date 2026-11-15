/** Formatação PT-BR simples (sem Intl, roda igual no servidor e no navegador). */
export function fmt(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(digits);
  const [int, dec] = s.split('.');
  const neg = int.startsWith('-');
  const abs = neg ? int.slice(1) : int;
  const grouped = abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + grouped + (dec ? ',' + dec : '');
}

export function fmtDist(m: number): string {
  return m >= 1000 ? `${fmt(m / 1000, 1)} km` : `${fmt(m)} m`;
}

export function fmtDuration(min: number): string {
  if (!Number.isFinite(min)) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
