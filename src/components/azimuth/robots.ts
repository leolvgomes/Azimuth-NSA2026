import type { Lang } from '@/config/i18n';
import { tr } from '@/lib/i18n';

export function robotLabel(role: string, lang: Lang): string {
  switch (role) {
    case 'rescue':
      return tr(lang, 'robotRescue');
    case 'scout':
      return tr(lang, 'robotScout');
    case 'carrier':
      return tr(lang, 'robotCarrier');
    case 'relay':
      return tr(lang, 'robotRelay');
    default:
      return role;
  }
}
