'use client';
import dynamic from 'next/dynamic';

/** Leaflet mexe em window: só no cliente. */
const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="label">CARREGANDO MAPA DE JEZERO…</span>
    </div>
  ),
});

export function MapView() {
  return <MapInner />;
}
