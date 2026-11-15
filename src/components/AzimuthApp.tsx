'use client';
import { useEffect } from 'react';
import { brand } from '@/config/brand';
import { useAzimuth } from '@/state/store';
import { MapView } from '@/components/map/MapView';
import { TopBar } from '@/components/layout/TopBar';
import { SuitStrip } from '@/components/layout/SuitStrip';
import { LayersPanel } from '@/components/panels/LayersPanel';
import { RoutePanel } from '@/components/panels/RoutePanel';
import { AlertsStack } from '@/components/panels/AlertsStack';
import { AheadPanel, RoverViewPanel } from '@/components/panels/WalkPanels';
import { ReturnPanel, RobotsPanel } from '@/components/panels/RescuePanels';
import { AzimuthBar } from '@/components/azimuth/AzimuthBar';
import { ReplyCard } from '@/components/azimuth/ReplyCard';
import { IntroGate } from '@/components/intro/IntroGate';

const LEFT_W = { plan: 300, walk: 340, rescue: 400 } as const;
const RIGHT_W = { plan: 380, walk: 400, rescue: 380 } as const;

export default function AzimuthApp() {
  const mode = useAzimuth((s) => s.mode);
  const init = useAzimuth((s) => s.init);
  const setMode = useAzimuth((s) => s.setMode);
  const enterRescue = useAzimuth((s) => s.enterRescue);
  const dataReady = useAzimuth((s) => s.dataReady);

  useEffect(() => {
    init();
  }, [init]);

  if (mode === 'intro') {
    return (
      <IntroGate
        onEnter={() => setMode('plan')}
        onRescue={() => {
          setMode('plan');
          enterRescue();
        }}
      />
    );
  }

  const m = mode;
  const centerLeft = 24 + LEFT_W[m] + 16;
  const centerRight = 24 + RIGHT_W[m] + 16;

  return (
    <main className={`screen ${m === 'rescue' ? 'rs' : ''}`}>
      <MapView />
      <div className="grid-ov" style={{ zIndex: 1 }} />

      <TopBar />

      {/* coluna esquerda */}
      <div className="absolute z-[900] scroll-thin" style={{ left: 24, top: 112, maxHeight: 'calc(100vh - 88px - 104px - 36px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
        {m === 'plan' ? <LayersPanel /> : m === 'walk' ? <AheadPanel /> : <ReturnPanel />}
      </div>

      {/* coluna direita */}
      <div className="absolute z-[900] scroll-thin" style={{ right: 24, top: 112, maxHeight: 'calc(100vh - 88px - 104px - 36px)', overflowY: 'auto', overflowX: 'hidden', paddingLeft: 2 }}>
        {m === 'plan' ? <RoutePanel /> : m === 'walk' ? <RoverViewPanel /> : <RobotsPanel />}
      </div>

      {/* centro: alertas + resposta da Azimuth (sem cobrir o mapa inteiro) */}
      <div
        className="absolute z-[950] flex flex-col gap-3 pointer-events-none [&>*]:pointer-events-auto"
        style={{ left: centerLeft, top: 112, width: `min(440px, calc(100vw - ${centerLeft + centerRight}px))` }}
      >
        <AlertsStack />
        <ReplyCard />
      </div>

      {/* barra da Azimuth */}
      <div className="absolute z-[960]" style={{ left: centerLeft, right: centerRight, bottom: 124, maxWidth: 680 }}>
        <AzimuthBar />
      </div>

      {!dataReady ? (
        <div className="absolute z-[960] label" style={{ left: centerLeft, bottom: 200 }}>
          CARREGANDO DADOS NASA…
        </div>
      ) : null}

      <SuitStrip />

      <div className="absolute z-[1001] src" style={{ right: 32, bottom: 6, pointerEvents: 'none' }}>
        {brand.credits}
      </div>
    </main>
  );
}
