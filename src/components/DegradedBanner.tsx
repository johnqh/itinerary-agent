import type { DegradedState } from "@/types/workspace";

/**
 * Names every degraded mode currently in effect.
 *
 * Silent degradation is the failure this component exists to prevent, so it is
 * deliberately plain rather than alarming: these are working states the
 * traveller should be able to read and dismiss mentally, not errors.
 */
export default function DegradedBanner({ degraded }: { degraded: DegradedState }) {
  const notices = [
    degraded.discovery,
    degraded.routing,
    degraded.optimizer,
    degraded.meals,
    degraded.map,
  ].filter((n): n is string => Boolean(n));

  if (notices.length === 0) return null;

  return (
    <aside className="border-b border-hairline bg-[#F3EFE2] px-4 py-2">
      <ul className="space-y-1">
        {notices.map((notice) => (
          <li key={notice} className="flex gap-2 text-[11px] leading-snug text-ink/80">
            <span className="eyebrow shrink-0 pt-[1px] text-ink/50">Note</span>
            <span>{notice}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
