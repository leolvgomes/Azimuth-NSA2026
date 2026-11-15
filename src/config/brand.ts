/**
 * Identidade visual e textos do site: TUDO que a Clara pode mudar fica aqui.
 * Trocar nome, cor ou fonte = mudar este arquivo. Os componentes leem daqui
 * (e o globals.css expõe as mesmas cores como CSS variables, ver applyBrandVars).
 */
export const brand = {
  name: 'AZIMUTH',
  fullName: 'Azimuth: Interplanetary Guide',
  tagline: 'Know the way home.',
  subtitle: 'O caminho mais seguro em Jezero. E sempre o caminho de volta.',
  assistantName: 'AZIMUTH',
  challenge: 'NASA Space Apps 2026 · Interplanetary Survival Guide: Martian Map',
  sampleDataLabel: 'DADOS DE EXEMPLO',

  colors: {
    bg: '#050505',
    surface: '#0E0E0E',
    surface2: '#161616',
    line: '#2A2A2A',
    lineStrong: '#3A3A3A',
    text: '#EDEDED',
    textDim: '#8A8A8A',
    textFaint: '#5A5A5A',
    accent: '#D4FF00', // alternativa em discussão: '#4FE3FF'
    alert: '#E35D3F', // perigo e modo Resgate, só isso
    alertBg: '#1A0B08',
    alertText: '#F2B5A6',
    mars: '#C1440E',
  },

  fonts: {
    display: 'Michroma', // títulos largos (Google Fonts)
    body: 'Montserrat',
    mono: 'JetBrains Mono',
  },

  credits:
    'NASA/JPL-Caltech · MRO CTX · MOLA · THEMIS · CRISM · USGS Astrogeology · MEDA · RAD',
} as const;

export type Brand = typeof brand;

/** CSS variables derived from brand.colors (used by layout.tsx on <html>). */
export function brandCssVars(): Record<string, string> {
  const c = brand.colors;
  return {
    '--bg': c.bg,
    '--surface': c.surface,
    '--surface-2': c.surface2,
    '--line': c.line,
    '--line-strong': c.lineStrong,
    '--text': c.text,
    '--text-dim': c.textDim,
    '--text-faint': c.textFaint,
    '--accent': c.accent,
    '--alert': c.alert,
    '--alert-bg': c.alertBg,
    '--alert-text': c.alertText,
    '--mars': c.mars,
  };
}
