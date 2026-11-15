/**
 * Imagem de pré-visualização do link (WhatsApp, Slack, formulário da submissão). Gerada no build.
 * Visual do site: fundo preto, grade, logo em losango, destaque verde-limão, Marte em salmão.
 */
import { ImageResponse } from 'next/og';
import { brand } from '@/config/brand';

export const alt = `${brand.fullName}: ${brand.text.en.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  const c = brand.colors;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: c.bg,
          color: c.text,
          fontFamily: 'sans-serif',
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      >
        {/* Marte */}
        <div
          style={{
            position: 'absolute',
            right: -330,
            bottom: -300,
            width: 720,
            height: 720,
            borderRadius: 360,
            background: `radial-gradient(circle at 35% 30%, #E07A45 0%, ${c.mars} 38%, #7A2A0A 70%, #2A0E04 100%)`,
            boxShadow: '0 0 120px 20px rgba(193,68,14,0.35)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', padding: '72px 80px', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <div
              style={{
                width: 56,
                height: 56,
                border: `4px solid ${c.accent}`,
                transform: 'rotate(45deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ width: 16, height: 16, background: c.accent }} />
            </div>
            <div style={{ fontSize: 22, letterSpacing: 6, color: c.textDim }}>INTERPLANETARY GUIDE</div>
          </div>
          <div style={{ fontSize: 120, letterSpacing: 24, marginTop: 56, fontWeight: 300 }}>{brand.name}</div>
          <div style={{ fontSize: 40, color: c.accent, marginTop: 8, letterSpacing: 2 }}>{brand.text.en.tagline}</div>
          <div style={{ fontSize: 26, color: c.textDim, marginTop: 28, maxWidth: 600, lineHeight: 1.4 }}>
            {brand.text.en.description}
          </div>
          <div style={{ fontSize: 18, color: c.textFaint, marginTop: 48, letterSpacing: 3 }}>NASA SPACE APPS CHALLENGE 2026 · JEZERO CRATER, MARS</div>
        </div>
      </div>
    ),
    size,
  );
}
