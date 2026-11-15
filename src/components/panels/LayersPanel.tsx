'use client';
import { useAzimuth } from '@/state/store';
import { LAYER_GROUPS } from '@/lib/layers';
import { Hud } from '@/components/ui/Hud';

export function LayersPanel() {
  const layers = useAzimuth((s) => s.layers);
  const toggle = useAzimuth((s) => s.toggleLayer);
  const tod = useAzimuth((s) => s.timeOfDay);
  const setTod = useAzimuth((s) => s.setTimeOfDay);

  return (
    <Hud title="CAMADAS" style={{ width: 300 }}>
      {LAYER_GROUPS.map((g) => (
        <div key={g.id}>
          <button type="button" className={`toggle ${layers[g.id] ? 'on' : ''}`} aria-pressed={layers[g.id]} onClick={() => toggle(g.id)}>
            <div>
              <div className="n">{g.label}</div>
              <div className="s">{g.sublabel}</div>
            </div>
            <div className="sw">
              <div className="k" />
            </div>
          </button>
          {g.id === 'thermal' ? (
            <div className="seg" role="group" aria-label="Dia ou noite">
              <button type="button" className={tod === 'day' ? 'on' : ''} aria-pressed={tod === 'day'} onClick={() => setTod('day')}>
                ☀ DIA
              </button>
              <button type="button" className={tod === 'night' ? 'on' : ''} aria-pressed={tod === 'night'} onClick={() => setTod('night')}>
                ☾ NOITE
              </button>
            </div>
          ) : null}
        </div>
      ))}
      <div className="legend" aria-label="Legenda do mapa">
        <div className="ln" style={{ borderTopStyle: 'solid', borderTopWidth: 3, borderColor: 'var(--accent)' }} />
        <span className="src">ROTA ATIVA</span>
        <div className="ln" style={{ borderTopStyle: 'dotted', borderColor: 'var(--text)' }} />
        <span className="src">ALTERNATIVA (CLIQUE PARA ESCOLHER)</span>
        <div className="ln" style={{ borderTopStyle: 'solid', borderTopWidth: 3, borderColor: 'var(--alert)' }} />
        <span className="src">TRECHO COM ALERTA</span>
        <div className="ln" style={{ borderTopStyle: 'dashed', borderColor: 'var(--text)' }} />
        <span className="src">TRILHA PERSEVERANCE</span>
        <div className="ring" style={{ width: 14, height: 14 }} />
        <span className="src">FOTO DO ROVER</span>
      </div>
    </Hud>
  );
}
