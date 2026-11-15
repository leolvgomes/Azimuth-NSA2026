import type { Lang } from '@/config/i18n';

/**
 * Screen labels specific to the 3D intro, per language (English is the site default).
 * Brand-level strings (name, tagline, subtitle, sample-data label) come from brand.text[lang].
 */
const en = {
  productLine: 'INTERPLANETARY GUIDE',
  youAreHere: 'YOU ARE HERE',
  placeName: 'JEZERO CRATER',
  enter: 'ENTER',
  skip: 'SKIP',
  clickHint: 'DRAG TO ROTATE · SCROLL TO ZOOM · DOUBLE-CLICK TO RECENTER',
  air: 'AIR · MEDA',
  radiation: 'RADIATION · RAD (EST.)',
  radiationUnit: 'mSv/day',
  o2: 'SUIT O₂',
  battery: 'BATTERY',
  base: 'BASE',
  imageryCredit: 'Mars imagery: NASA/JPL-Caltech/USGS · Jezero: MRO CTX, NASA/JPL-Caltech/MSSS',
  noWebgl: '3D view unavailable on this device.',
};

export type IntroCopy = typeof en;

const pt: IntroCopy = {
  productLine: 'INTERPLANETARY GUIDE',
  youAreHere: 'VOCÊ ESTÁ AQUI',
  placeName: 'CRATERA JEZERO',
  enter: 'ENTRAR',
  skip: 'PULAR',
  clickHint: 'ARRASTE PARA GIRAR · ROLE PARA ZOOM · DUPLO CLIQUE RECENTRALIZA',
  air: 'AR · MEDA',
  radiation: 'RADIAÇÃO · RAD (EST.)',
  radiationUnit: 'mSv/dia',
  o2: 'O₂ TRAJE',
  battery: 'BATERIA',
  base: 'BASE',
  imageryCredit: 'Imagens de Marte: NASA/JPL-Caltech/USGS · Jezero: MRO CTX, NASA/JPL-Caltech/MSSS',
  noWebgl: 'Visualização 3D indisponível neste dispositivo.',
};

export const introCopy: Record<Lang, IntroCopy> = { en, pt };
