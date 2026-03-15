import type { Alert } from "../lib/types";

interface AlertBannerProps {
  alerts: Alert[];
}

export default function AlertBanner({ alerts }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  // Show most severe first
  const sorted = [...alerts].sort((a, b) =>
    a.severity === "critical" ? -1 : b.severity === "critical" ? 1 : 0
  );

  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex flex-col gap-1.5 items-center pointer-events-none">
      {sorted.map((alert) => (
        <div
          key={alert.id}
          className={`px-4 py-1.5 rounded-lg text-[12px] font-bold uppercase tracking-wide backdrop-blur ${
            alert.severity === "critical"
              ? "bg-rose-600/70 text-white animate-pulse"
              : "bg-amber-500/70 text-amber-950"
          }`}
        >
          {alert.message}
        </div>
      ))}
    </div>
  );
}
