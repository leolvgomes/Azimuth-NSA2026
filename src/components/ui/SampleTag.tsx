'use client';
import { brand } from '@/config/brand';
import { useT } from '@/lib/useT';

export function SampleTag({ className = '' }: { className?: string }) {
  const { lang } = useT();
  return <span className={`sample ${className}`}>{brand.text[lang].sampleDataLabel}</span>;
}
