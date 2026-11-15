import { brand } from '@/config/brand';

export function SampleTag({ className = '' }: { className?: string }) {
  return <span className={`sample ${className}`}>{brand.sampleDataLabel}</span>;
}
