'use client';
/* eslint-disable @next/next/no-img-element */
import type { RoverPhoto } from '@/core/types';
import { localized } from '@/config/i18n';
import { useT } from '@/lib/useT';

/** Foto real do rover (ou placeholder com o gradiente do design enquanto não há fotos). */
export function PhotoFrame({ photo, height, caption, tag, className = '', onClick }: {
  photo: RoverPhoto | null;
  height: number;
  caption?: string;
  tag?: string;
  className?: string;
  onClick?: () => void;
}) {
  const { lang, t } = useT();
  const cap = caption ?? (photo ? `${photo.camera} · SOL ${photo.sol}` : lang === 'en' ? 'NO NEARBY PHOTO' : 'SEM FOTO PRÓXIMA');
  const inner = (
    <>
      {photo ? <img src={photo.src} alt={localized(photo.caption, photo.captionEn, lang) || `Rover photo, sol ${photo.sol}`} loading="lazy" /> : null}
      {tag ? <div className="tag-sample">{tag}</div> : null}
      <div className="cap">{cap}</div>
    </>
  );
  if (onClick)
    return (
      <button type="button" className={`photo block w-full p-0 border-0 ${className}`} style={{ height }} onClick={onClick} aria-label={t('enlargePhoto')}>
        {inner}
      </button>
    );
  return (
    <div className={`photo ${className}`} style={{ height }}>
      {inner}
    </div>
  );
}
