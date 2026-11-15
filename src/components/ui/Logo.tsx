export function Logo({ alert = false }: { alert?: boolean }) {
  return (
    <div className="logo" style={alert ? { borderColor: 'var(--alert)' } : undefined} aria-hidden>
      <div style={alert ? { background: 'var(--alert)' } : undefined} />
    </div>
  );
}
