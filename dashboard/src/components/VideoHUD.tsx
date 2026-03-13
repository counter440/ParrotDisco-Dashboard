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
      width="96"
      height="96"
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

function rssiLevel(rssi: string): number {
  const val = parseInt(rssi);
  if (isNaN(val)) return 0;
  if (val > -65) return 4;
  if (val > -75) return 3;
  if (val > -85) return 2;
  if (val > -95) return 1;
  return 0;
}

function rssiColor(rssi: string): string {
  const level = rssiLevel(rssi);
  if (level >= 3) return "text-emerald-400";
  if (level >= 2) return "text-amber-400";
  return "text-rose-500";
}

function SignalBars({ rssi }: { rssi: string }) {
  const level = rssiLevel(rssi);
  const color = level >= 3 ? "#34d399" : level >= 2 ? "#fbbf24" : "#f43f5e";
  const inactiveColor = "rgba(255,255,255,0.15)";

  return (
    <svg width="36" height="24" viewBox="0 0 20 16">
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 5}
          y={12 - i * 3}
          width="4"
          height={4 + i * 3}
          rx="0.5"
          fill={i < level ? color : inactiveColor}
        />
      ))}
    </svg>
  );
}

function BatteryIcon({ pct }: { pct: number }) {
  const color = pct > 30 ? "#34d399" : pct > 15 ? "#fbbf24" : "#f43f5e";
  const fillWidth = Math.max(0, Math.min(16, (pct / 100) * 16));

  return (
    <svg width="36" height="20" viewBox="0 0 28 16">
      <rect x="0" y="2" width="23" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="23" y="5" width="3" height="6" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="3" y="5" width={fillWidth} height="6" rx="1" fill={color} />
    </svg>
  );
}

function SatelliteIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 7L9 3L5 7l4 4" />
      <path d="M17 11l4 4-4 4-4-4" />
      <path d="m8 12 4 4" />
      <path d="m12 8 4 4" />
      <path d="m2 22 3-3" />
      <path d="M7 17a5 5 0 0 0 0-7" />
      <path d="M11 21a9 9 0 0 0 0-13" />
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
            className="bg-black/40 backdrop-blur rounded-lg px-4 py-2 text-white/90 tabular-nums text-[20px] font-semibold"
            style={textShadow}
          >
            {t.attitude.yaw.toFixed(0)}&deg;
          </div>
        </div>

        {/* Top-right: Signal + Battery + altitude */}
        <div className="flex flex-col items-end gap-2">
          <div className={`bg-black/40 backdrop-blur rounded-lg px-4 py-2 tabular-nums font-semibold text-[20px] flex items-center gap-2 ${rssiColor(t.rssi)}`}>
            <SignalBars rssi={t.rssi} />
            <span>{t.rssi || "--"}</span>
          </div>
          <div className={`bg-black/40 backdrop-blur rounded-lg px-4 py-2 tabular-nums font-semibold text-[20px] flex items-center gap-2 ${batteryColor(t.battery)}`}>
            <BatteryIcon pct={t.battery} />
            <span>{t.battery}%</span>
          </div>
          <div className={`bg-black/40 backdrop-blur rounded-lg px-4 py-2 text-[20px] font-semibold tabular-nums flex items-center gap-2 ${satsColor(t.gpsSats)}`}>
            <SatelliteIcon />
            <span>{t.gpsSats} sats</span>
          </div>
          <div
            className="bg-black/40 backdrop-blur rounded-lg px-4 py-2 text-white/90 tabular-nums text-[20px] font-semibold"
            style={textShadow}
          >
            {t.altitude} m
          </div>
          <div className={`backdrop-blur rounded-lg px-4 py-2 text-[18px] uppercase font-semibold ${stateColor(t.flyingState)}`}>
            {t.flyingState}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="flex justify-between items-end">
        {/* Bottom-left: Speeds */}
        <div className="flex flex-col gap-1.5">
          <div
            className="bg-black/40 backdrop-blur rounded-lg px-4 py-2 text-white/90 tabular-nums text-[20px] font-semibold"
            style={textShadow}
          >
            AS {t.airspeed} m/s
          </div>
          <div
            className="bg-black/40 backdrop-blur rounded-lg px-4 py-2 text-white/90 tabular-nums text-[20px] font-semibold"
            style={textShadow}
          >
            GS {t.groundspeed} m/s
          </div>
        </div>

        {/* Bottom-right: empty */}
        <div />
      </div>
    </div>
  );
}
