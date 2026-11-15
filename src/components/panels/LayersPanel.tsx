'use client';
import { useAzimuth } from '@/state/store';
import { LAYER_GROUPS } from '@/lib/layers';
import { useT } from '@/lib/useT';
import type { I18nKey } from '@/lib/i18n';
import { Hud } from '@/components/ui/Hud';

export function LayersPanel() {
  const { t } = useT();
  const layers = useAzimuth((s) => s.layers);
  const toggle = useAzimuth((s) => s.toggleLayer);
  const tod = useAzimuth((s) => s.timeOfDay);
  const setTod = useAzimuth((s) => s.setTimeOfDay);

  return (
    <Hud title={t('layers')} style={{ width: 300 }}>
      {LAYER_GROUPS.map((g) => (
        <div key={g.id}>
          <button type="button" className={`toggle ${layers[g.id] ? 'on' : ''}`} aria-pressed={layers[g.id]} onClick={() => toggle(g.id)}>
            <div>
              <div className="n">{t(`layer_${g.id}` as I18nKey)}</div>
              <div className="s">{t(`layer_${g.id}_s` as I18nKey)}</div>
            </div>
            <div className="sw">
              <div className="k" />
            </div>
          </button>
          {g.id === 'thermal' ? (
            <div className="seg" role="group" aria-label={t('dayOrNight')}>
              <button type="button" className={tod === 'day' ? 'on' : ''} aria-pressed={tod === 'day'} onClick={() => setTod('day')}>
                {t('day')}
              </button>
              <button type="button" className={tod === 'night' ? 'on' : ''} aria-pressed={tod === 'night'} onClick={() => setTod('night')}>
                {t('night')}
              </button>
            </div>
          ) : null}
        </div>
      ))}
      <div className="legend" aria-label="Legend">
        <div className="ln" style={{ borderTopStyle: 'solid', borderTopWidth: 3, borderColor: 'var(--accent)' }} />
        <span className="src">{t('lgActive')}</span>
        <div className="ln" style={{ borderTopStyle: 'dotted', borderColor: 'var(--text)' }} />
        <span className="src">{t('lgAlt')}</span>
        <div className="ln" style={{ borderTopStyle: 'solid', borderTopWidth: 3, borderColor: 'var(--alert)' }} />
        <span className="src">{t('lgAlert')}</span>
        <div className="ln" style={{ borderTopStyle: 'dashed', borderColor: 'var(--text)' }} />
        <span className="src">{t('lgTrack')}</span>
        <div className="ring" style={{ width: 14, height: 14 }} />
        <span className="src">{t('lgPhoto')}</span>
        <div className="sci" style={{ width: 16, height: 16, fontSize: 9 }}>⚗</div>
        <span className="src">{t('lgScience')}</span>
      </div>
    </Hud>
  );
}
