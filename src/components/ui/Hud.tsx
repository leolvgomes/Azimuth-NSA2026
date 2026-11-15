import type { CSSProperties, ReactNode } from 'react';

/** Painel flutuante com cantos em L (design system: HUD PANEL). */
export function Hud({
  children,
  className = '',
  style,
  title,
  tour,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: ReactNode;
  /** Âncora do tutorial interativo (data-tour). */
  tour?: string;
}) {
  return (
    <section className={`hud ${className}`} style={style} data-tour={tour}>
      <div className="c tl" />
      <div className="c tr" />
      <div className="c bl" />
      <div className="c br" />
      {title ? <h3 className="h3">{title}</h3> : null}
      {children}
    </section>
  );
}
