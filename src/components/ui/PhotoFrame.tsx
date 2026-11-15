/* eslint-disable @next/next/no-img-element */
import type { RoverPhoto } from '@/core/types';

/** Foto real do rover (ou placeholder com o gradiente do design enquanto não há fotos). */
export function PhotoFrame({ photo, height, caption, tag, className = '', onClick }: {
  photo: RoverPhoto | null;
  height: number;
  caption?: string;
  tag?: string;
  className?: string;
  onClick?: () => void;
}) {
  const cap = caption ?? (photo ? `${photo.camera} · SOL ${photo.sol}` : 'SEM FOTO PRÓXIMA');
  const inner = (
    <>
      {photo ? <img src={photo.src} alt={photo.caption || `Foto do rover, sol ${photo.sol}`} loading="lazy" /> : null}
      {tag ? <div className="tag-sample">{tag}</div> : null}
      <div className="cap">{cap}</div>
    </>
  );
  if (onClick)
    return (
      <button type="button" className={`photo block w-full p-0 border-0 ${className}`} style={{ height }} onClick={onClick} aria-label="Ampliar foto do rover">
        {inner}
      </button>
    );
  return (
    <div className={`photo ${className}`} style={{ height }}>
      {inner}
    </div>
  );
}
