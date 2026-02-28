import type { TelemetryData } from "../lib/types";

interface VideoHUDProps {
  telemetry: TelemetryData;
}

function batteryColor(pct: number): string {
  if (pct > 30) return "text-emerald-400";
  if (pct > 15) return "text-amber-400";
  return "text-rose-500";
}

function satsColor(sats: number): string {
  if (sats >= 6) return "text-emerald-400";
  if (sats >= 3) return "text-amber-400";
  return "text-rose-500";
}

function stateColor(state: string): string {
  switch (state) {
    case "flying":
    case "hovering":
      return "bg-emerald-500/60 text-emerald-100";
    case "landing":
    case "takingoff":
      return "bg-amber-500/60 text-amber-100";
    case "emergency":
      return "bg-rose-500/60 text-rose-100";
    default:
      return "bg-white/20 text-white/70";
  }
}

function MiniAttitudeIndicator({ roll, pitch }: { roll: number; pitch: number }) {
  const pitchOffset = Math.max(-30, Math.min(30, pitch * 0.8));

  return (
    <svg
      width="48"
      height="48"
      viewBox="-44 -44 88 88"
      className="rounded-full"
      style={{ filter: "drop-shadow(0 0 6px rgba(6,182,212,0.3))" }}
    >
      <defs>
        <clipPath id="hud-horizon-clip">
          <circle cx="0" cy="0" r="42" />
        </clipPath>
      </defs>

      <g clipPath="url(#hud-horizon-clip)">
        <g transform={`rotate(${-roll}) translate(0, ${pitchOffset})`}>
          <rect x="-100" y="-100" width="200" height="100" fill="#0c4a6e" />
          <rect x="-100" y="0" width="200" height="100" fill="#78350f" />
          <line x1="-100" y1="0" x2="100" y2="0" stroke="white" strokeWidth="0.5" opacity="0.6" />
        </g>
      </g>

      <line x1="-18" y1="0" x2="-6" y2="0" stroke="rgb(6,182,212)" strokeWidth="2.5" />
      <line x1="6" y1="0" x2="18" y2="0" stroke="rgb(6,182,212)" strokeWidth="2.5" />
      <circle cx="0" cy="0" r="2.5" fill="rgb(6,182,212)" />
      <circle cx="0" cy="0" r="42" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
    </svg>
  );
}

const textShadow = { textShadow: "0 1px 4px rgba(0,0,0,0.8)" };

export default function VideoHUD({ telemetry: t }: VideoHUDProps) {
  return (
    <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between text-[12px] font-medium">
      {/* Top row */}
      <div className="flex justify-between items-start">
        {/* Top-left: Mini attitude + heading */}
        <div className="flex items-center gap-2">
          <MiniAttitudeIndicator roll={t.attitude.roll} pitch={t.attitude.pitch} />
          <div
            className="bg-black/40 backdrop-blur rounded-lg px-2 py-1 text-white/90 tabular-nums"
            style={textShadow}
          >
            {t.attitude.yaw.toFixed(0)}&deg;
          </div>
        </div>

        {/* Top-right: Battery + altitude */}
        <div className="flex flex-col items-end gap-1.5">
          <div className={`bg-black/40 backdrop-blur rounded-lg px-2 py-1 tabular-nums font-semibold ${batteryColor(t.battery)}`}>
            {t.battery}%
          </div>
          <div
            className="bg-black/40 backdrop-blur rounded-lg px-2 py-1 text-white/90 tabular-nums"
            style={textShadow}
          >
            {t.altitude} m
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="flex justify-between items-end">
        {/* Bottom-left: Speeds */}
        <div className="flex flex-col gap-1.5">
          <div
            className="bg-black/40 backdrop-blur rounded-lg px-2 py-1 text-white/90 tabular-nums"
            style={textShadow}
          >
            AS {t.airspeed} m/s
          </div>
          <div
            className="bg-black/40 backdrop-blur rounded-lg px-2 py-1 text-white/90 tabular-nums"
            style={textShadow}
          >
            GS {t.groundspeed} m/s
          </div>
        </div>

        {/* Bottom-right: Flying state + GPS */}
        <div className="flex flex-col items-end gap-1.5">
          <div className={`backdrop-blur rounded-lg px-2 py-1 text-[11px] uppercase font-semibold ${stateColor(t.flyingState)}`}>
            {t.flyingState}
          </div>
          <div className={`bg-black/40 backdrop-blur rounded-lg px-2 py-1 tabular-nums ${satsColor(t.gpsSats)}`}>
            {t.gpsSats} sats{t.gpsFixed ? " (fix)" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
