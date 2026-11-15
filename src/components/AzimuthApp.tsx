'use client';
import { useEffect, type ReactNode } from 'react';
import { brand } from '@/config/brand';
import { useAzimuth } from '@/state/store';
import { useLayout, useViewport, type Side } from '@/state/layout';
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
import { useT } from '@/lib/useT';
import type { I18nKey } from '@/lib/i18n';
import { AboutScreen } from '@/components/guide/AboutScreen';
import { Tour, TourInvite } from '@/components/guide/Tour';

type AppMode = 'plan' | 'walk' | 'rescue';

const LEFT_W = { plan: 300, walk: 340, rescue: 400 } as const;
const RIGHT_W = { plan: 380, walk: 400, rescue: 380 } as const;
/** Largura da aba de uma coluna recolhida. */
const TAB_W = 44;
const EDGE = 24;
const GAP = 16;

const PANEL_NAME: Record<AppMode, Record<Side, I18nKey>> = {
  plan: { left: 'pnLayers', right: 'pnRoute' },
  walk: { left: 'pnAhead', right: 'pnRover' },
  rescue: { left: 'pnReturn', right: 'pnRobots' },
};

function panelFor(mode: AppMode, side: Side): ReactNode {
  if (side === 'left') return mode === 'plan' ? <LayersPanel /> : mode === 'walk' ? <AheadPanel /> : <ReturnPanel />;
  return mode === 'plan' ? <RoutePanel /> : mode === 'walk' ? <RoverViewPanel /> : <RobotsPanel />;
}

/** Coluna lateral com botão de recolher; recolhida vira uma aba vertical na borda. */
function SideColumn({ side, mode }: { side: Side; mode: AppMode }) {
  const { t } = useT();
  const open = useLayout((s) => (side === 'left' ? s.leftOpen : s.rightOpen));
  const setOpen = useLayout((s) => s.setOpen);
  const width = side === 'left' ? LEFT_W[mode] : RIGHT_W[mode];
  const name = t(PANEL_NAME[mode][side]);
  const pos = side === 'left' ? { left: EDGE } : { right: EDGE };

  if (!open) {
    return (
      <button type="button" className={`side-tab ${side}`} style={{ ...pos, top: 112 }} onClick={() => setOpen(side, true)} aria-label={`${t('showPanel')}: ${name}`} title={t('showPanel')}>
        <span>{side === 'left' ? '▸' : '◂'}</span>
        <span className="side-tab-t">{name}</span>
      </button>
    );
  }
  return (
    <div className="absolute z-[900]" style={{ ...pos, top: 112 }}>
      <div className="scroll-thin" style={{ maxHeight: 'calc(100vh - 88px - 104px - 36px)', overflowY: 'auto', overflowX: 'hidden', width: width + 2, [side === 'left' ? 'paddingRight' : 'paddingLeft']: 2 }}>
        {panelFor(mode, side)}
      </div>
      <button
        type="button"
        className={`col-x ${side}`}
        onClick={() => setOpen(side, false)}
        aria-label={`${t('hidePanel')}: ${name}`}
        title={t('hidePanel')}
      >
        {side === 'left' ? '◂' : '▸'}
      </button>
    </div>
  );
}

function DesktopLayout({ mode }: { mode: AppMode }) {
  const { t } = useT();
  const dataReady = useAzimuth((s) => s.dataReady);
  const leftOpen = useLayout((s) => s.leftOpen);
  const rightOpen = useLayout((s) => s.rightOpen);
  const centerLeft = EDGE + (leftOpen ? LEFT_W[mode] + 12 : TAB_W) + GAP;
  const centerRight = EDGE + (rightOpen ? RIGHT_W[mode] + 12 : TAB_W) + GAP;

  return (
    <>
      <SideColumn side="left" mode={mode} />
      <SideColumn side="right" mode={mode} />

      {/* centro: alertas + resposta da Azimuth (sem cobrir o mapa inteiro) */}
      <div
        className="absolute z-[950] flex flex-col gap-3 pointer-events-none [&>*]:pointer-events-auto"
        style={{ left: centerLeft, top: 112, width: `min(440px, calc(100vw - ${centerLeft + centerRight}px))` }}
      >
        <AlertsStack />
        <ReplyCard />
      </div>

      {/* barra da Azimuth */}
      <div className="absolute z-[960]" data-tour="azimuth-bar" style={{ left: centerLeft, right: centerRight, bottom: 124, maxWidth: 680 }}>
        <AzimuthBar />
      </div>

      {!dataReady ? (
        <div className="absolute z-[960] label" style={{ left: centerLeft, bottom: 240 }}>
          {t('loadingData')}
        </div>
      ) : null}
    </>
  );
}

/** Celular: mapa inteiro, alertas e respostas no topo, painéis numa gaveta inferior. */
function MobileLayout({ mode }: { mode: AppMode }) {
  const { t } = useT();
  const dataReady = useAzimuth((s) => s.dataReady);
  const sheet = useLayout((s) => s.sheet);
  const setSheet = useLayout((s) => s.setSheet);
  const toggle = (side: Side) => setSheet(sheet === side ? null : side);

  return (
    <>
      <div className="m-top">
        <AlertsStack />
        <ReplyCard />
      </div>

      {sheet ? (
        <div className="m-sheet scroll-thin" role="region" aria-label={t(PANEL_NAME[mode][sheet])}>
          {panelFor(mode, sheet)}
        </div>
      ) : (
        <div className="m-bar" data-tour="azimuth-bar">
          <AzimuthBar />
          {!dataReady ? (
            <div className="label" style={{ marginTop: 6 }}>
              {t('loadingData')}
            </div>
          ) : null}
        </div>
      )}

      <div className="m-dock" role="group">
        {(['left', 'right'] as Side[]).map((side) => (
          <button key={side} type="button" className={`m-dock-btn ${sheet === side ? 'on' : ''}`} aria-expanded={sheet === side} onClick={() => toggle(side)}>
            {t(PANEL_NAME[mode][side])} {sheet === side ? '▾' : '▴'}
          </button>
        ))}
      </div>
    </>
  );
}

export default function AzimuthApp() {
  const mode = useAzimuth((s) => s.mode);
  const init = useAzimuth((s) => s.init);
  const setMode = useAzimuth((s) => s.setMode);
  const enterRescue = useAzimuth((s) => s.enterRescue);
  const { mobile, w } = useViewport();

  useEffect(() => {
    init();
  }, [init]);

  if (mode === 'intro') {
    return (
      <>
        <IntroGate
          onEnter={() => setMode('plan')}
          onRescue={() => {
            setMode('plan');
            enterRescue();
          }}
        />
        <AboutScreen />
      </>
    );
  }

  const m: AppMode = mode;
  return (
    <main className={`screen ${m === 'rescue' ? 'rs' : ''} ${mobile ? 'mobile' : ''}`}>
      <MapView />
      <div className="grid-ov" style={{ zIndex: 1 }} />

      <TopBar />

      {w === 0 ? null : mobile ? <MobileLayout mode={m} /> : <DesktopLayout mode={m} />}

      <SuitStrip />

      <div className="absolute z-[1001] src credits" style={{ right: 32, bottom: 6, pointerEvents: 'none' }}>
        {brand.credits}
      </div>

      <Tour />
      <TourInvite />
      <AboutScreen />
    </main>
  );
}
