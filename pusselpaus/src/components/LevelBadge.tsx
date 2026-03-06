/* ── LevelBadge – compact inline level indicator ── */

interface LevelBadgeProps {
  level: number | null | undefined;
  /** Extra Tailwind classes */
  className?: string;
}

export default function LevelBadge({ level, className = '' }: LevelBadgeProps) {
  const lv = level ?? 1;
  return (
    <span
      className={`inline-flex items-center rounded-full bg-brand/20 px-1.5 py-0.5 text-[10px] font-bold leading-none text-brand-light ${className}`}
      title={`Level ${lv}`}
    >
      Lv&thinsp;{lv}
    </span>
  );
}
