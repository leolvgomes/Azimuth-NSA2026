'use client';
import { useEffect, useRef, useState } from 'react';
import { brand } from '@/config/brand';
import { useAzimuth } from '@/state/store';
import { askAzimuth } from '@/lib/azimuthClient';
import { getRecognizerCtor, listen, type Recognizer } from '@/lib/speech';

const HINTS: Record<string, string> = {
  plan: '“me leve até o delta” · “quanto O₂ tenho de margem?”',
  walk: '“o que tem à frente?” · “mostra a foto”',
  rescue: '“quanto tempo até a base?” · “chama o robô”',
};

/** Barra fixa da Azimuth: texto + microfone (Web Speech API, pt-BR). */
export function AzimuthBar() {
  const mode = useAzimuth((s) => s.mode);
  const loading = useAzimuth((s) => s.chat.loading);
  const speakReplies = useAzimuth((s) => s.speakReplies);
  const setSpeak = useAzimuth((s) => s.setSpeakReplies);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const rec = useRef<Recognizer | null>(null);

  useEffect(() => {
    setCanListen(!!getRecognizerCtor());
  }, []);

  const send = (t = text) => {
    if (!t.trim()) return;
    setText('');
    void askAzimuth(t);
  };

  const toggleMic = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    rec.current = listen(
      (t, final) => {
        setText(t);
        if (final) {
          rec.current?.stop();
          send(t);
        }
      },
      () => setListening(false),
    );
    setListening(!!rec.current);
  };

  return (
    <form
      className="chat"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="dot" style={loading ? { animation: 'pulse 0.8s infinite' } : undefined} />
      <div className="who">{brand.assistantName}</div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={loading ? 'Pensando…' : HINTS[mode] ?? HINTS.plan}
        aria-label={`Pergunte à ${brand.assistantName}`}
        disabled={loading}
      />
      <button
        type="button"
        className={`ib ${speakReplies ? 'f' : ''}`}
        style={{ fontSize: 15 }}
        onClick={() => setSpeak(!speakReplies)}
        aria-pressed={speakReplies}
        aria-label="Ler respostas em voz alta"
        title="Ler respostas em voz alta"
      >
        🔊
      </button>
      {canListen ? (
        <button type="button" className={`ib ${listening ? 'live' : ''}`} onClick={toggleMic} aria-pressed={listening} aria-label="Falar com a Azimuth" title="Falar (pt-BR)">
          🎙
        </button>
      ) : null}
      <button type="submit" className="ib f" disabled={loading || !text.trim()} aria-label="Enviar">
        ↑
      </button>
    </form>
  );
}
