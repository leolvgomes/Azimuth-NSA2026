'use client';
import dynamic from 'next/dynamic';
import { useT } from '@/lib/useT';

function Loading() {
  const { t } = useT();
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="label">{t('loadingMap')}</span>
    </div>
  );
}

/** Leaflet mexe em window: só no cliente. */
const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => <Loading />,
});

export function MapView() {
  return <MapInner />;
}
