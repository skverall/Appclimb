export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-mark-wrap" aria-label="AppClimb">
      <svg
        className="brand-mark"
        viewBox="0 0 44 34"
        role="img"
        aria-hidden="true"
      >
        <path d="M1 31 14.4 4 27 31Z" fill="#19a89c" />
        <path d="m12 31 15.7-27L43 31Z" fill="#08787d" />
        <path d="m11.4 10.2 3-6.2 3 6.2-3 3.4Z" fill="#f8fbfa" />
        <path d="m24.5 9.6 3.2-5.6 3.2 5.6-3.2 3.1Z" fill="#f8fbfa" />
      </svg>
      {!compact && <span>AppClimb</span>}
    </div>
  );
}
