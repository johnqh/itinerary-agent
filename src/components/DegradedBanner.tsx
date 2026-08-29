import type { DegradedState } from "@/types/workspace";

/**
 * Names every degraded mode currently in effect. Silent degradation is the
 * failure this component exists to prevent.
 */
export default function DegradedBanner({ degraded }: { degraded: DegradedState }) {
  const notices = [degraded.discovery, degraded.routing, degraded.optimizer].filter(
    (n): n is string => Boolean(n),
  );
  if (notices.length === 0) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <ul className="space-y-0.5">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </div>
  );
}
