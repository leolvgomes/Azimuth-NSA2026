'use client';
/** Web Speech API (reconhecimento + leitura em voz alta), só quando o navegador suporta. */

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

export interface Recognizer {
  start(): void;
  stop(): void;
  abort(): void;
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}

type RecognizerCtor = new () => Recognizer;

export function getRecognizerCtor(): RecognizerCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function listen(onText: (text: string, final: boolean) => void, onEnd: () => void): Recognizer | null {
  const Ctor = getRecognizerCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'pt-BR';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let txt = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      txt += e.results[i][0]?.transcript ?? '';
      if (e.results[i].isFinal) final = true;
    }
    onText(txt, final);
  };
  rec.onend = onEnd;
  rec.onerror = () => onEnd();
  try {
    rec.start();
  } catch {
    return null;
  }
  return rec;
}

export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /\b(the|you|route|oxygen)\b/i.test(text) ? 'en-US' : 'pt-BR';
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  } catch {
    /* sem voz */
  }
}
