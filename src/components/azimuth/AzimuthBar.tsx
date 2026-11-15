'use client';
import { useEffect, useRef, useState } from 'react';
import { brand } from '@/config/brand';
import { LOCALE } from '@/config/i18n';
import { useAzimuth } from '@/state/store';
import { askAzimuth } from '@/lib/azimuthClient';
import { getRecognizerCtor, listen, type Recognizer } from '@/lib/speech';
import { useT } from '@/lib/useT';

/** Barra fixa da Azimuth: texto + microfone (Web Speech API, no idioma da interface). */
export function AzimuthBar() {
  const { t, lang } = useT();
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

  const hint = mode === 'walk' ? t('hintWalk') : mode === 'rescue' ? t('hintRescue') : t('hintPlan');

  const send = (msg = text) => {
    if (!msg.trim()) return;
    setText('');
    void askAzimuth(msg);
  };

  const toggleMic = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    rec.current = listen(
      (said, final) => {
        setText(said);
        if (final) {
          rec.current?.stop();
          send(said);
        }
      },
      () => setListening(false),
      LOCALE[lang],
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
        placeholder={loading ? t('thinking') : hint}
        aria-label={`${t('ask')} ${brand.assistantName}`}
        disabled={loading}
      />
      <button
        type="button"
        className={`ib ${speakReplies ? 'f' : ''}`}
        style={{ fontSize: 15 }}
        onClick={() => setSpeak(!speakReplies)}
        aria-pressed={speakReplies}
        aria-label={t('readAloud')}
        title={t('readAloud')}
      >
        🔊
      </button>
      {canListen ? (
        <button type="button" className={`ib ${listening ? 'live' : ''}`} onClick={toggleMic} aria-pressed={listening} aria-label={t('speakTo')} title={t('speakTo')}>
          🎙
        </button>
      ) : null}
      <button type="submit" className="ib f" disabled={loading || !text.trim()} aria-label={t('send')}>
        ↑
      </button>
    </form>
  );
}
