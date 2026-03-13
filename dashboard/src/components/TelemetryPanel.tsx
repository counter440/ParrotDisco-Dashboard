import {
  Battery,
  BatteryLow,
  BatteryWarning,
  MapPin,
  Satellite,
  Mountain,
  Gauge,
  Compass,
  PlaneTakeoff,
  PlaneLanding,
  Home,
  OctagonX,
  Thermometer,
  Camera,
  Signal,
} from "lucide-react";
import { useRef, useState } from "react";
import type { TelemetryData } from "../lib/types";
import AttitudeIndicator from "./AttitudeIndicator";

interface TelemetryPanelProps {
  telemetry: TelemetryData;
  send: (msg: Record<string, unknown>) => void;
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3">
      <h2 className="text-[11px] uppercase tracking-widest text-white/40 font-medium mb-2 flex items-center gap-1.5">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex justify-between items-center py-0.5 text-[13px]">
      <span className="text-white/40">{label}</span>
      <span className={`font-semibold tabular-nums ${color ?? "text-white/90"}`}>{value}</span>
    </div>
  );
}

function batteryColor(pct: number): string {
  if (pct > 30) return "text-emerald-400";
  if (pct > 15) return "text-amber-400";
  return "text-rose-500";
}

function batteryBarGradient(pct: number): string {
  if (pct > 30) return "bg-gradient-to-r from-emerald-500 to-emerald-400";
  if (pct > 15) return "bg-gradient-to-r from-amber-500 to-amber-400";
  return "bg-gradient-to-r from-rose-600 to-rose-500";
}

function BatteryIcon({ pct }: { pct: number }) {
  if (pct > 30) return <Battery size={12} />;
  if (pct > 15) return <BatteryWarning size={12} />;
  return <BatteryLow size={12} />;
}

function rssiColor(rssi: string): string {
  const val = parseInt(rssi);
  if (isNaN(val)) return "text-white/90";
  if (val > -65) return "text-emerald-400";
  if (val > -80) return "text-amber-400";
  return "text-rose-500";
}

function satsColor(sats: number): string {
  if (sats >= 6) return "text-emerald-400";
  if (sats >= 3) return "text-amber-400";
  return "text-rose-500";
}

export default function TelemetryPanel({ telemetry: t, send }: TelemetryPanelProps) {
  const [takeoffHeld, setTakeoffHeld] = useState(false);
  const takeoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLanded = t.flyingState === "landed" || t.flyingState === "disconnected";
  const isAirborne = t.flyingState === "flying" || t.flyingState === "hovering";
  const isArmed = !isLanded && t.flyingState !== "disconnected";
  const hasGpsFix = t.gpsSats >= 4 || (t.gps.lat !== 0 || t.gps.lon !== 0);
  const canTakeoff = isLanded && t.flyingState !== "disconnected" && hasGpsFix;

  const handleTakeoffDown = () => {
    if (!canTakeoff) return;
    setTakeoffHeld(true);
    takeoffTimerRef.current = setTimeout(() => {
      send({ type: "takeoff" });
      setTakeoffHeld(false);
    }, 1500);
  };

  const handleTakeoffUp = () => {
    if (takeoffTimerRef.current) {
      clearTimeout(takeoffTimerRef.current);
      takeoffTimerRef.current = null;
    }
    setTakeoffHeld(false);
  };

  return (
    <div className="p-3 flex flex-col gap-2 overflow-y-auto">
      {/* Flight State */}
      <Section title="Flight State" icon={<Compass size={12} />}>
        <div className="flex justify-between items-center py-0.5 text-[13px]">
          <span className="text-white/40">State</span>
          <span className="font-semibold tabular-nums text-white/90">{t.flyingState.toUpperCase()}</span>
        </div>
        <div className="flex justify-between items-center py-0.5 text-[13px] mb-1">
          <span className="text-white/40">Armed</span>
          <span className={`font-semibold text-[11px] px-2 py-0.5 rounded-full ${isArmed ? "bg-rose-500/20 text-rose-400" : "bg-white/[0.06] text-white/30"}`}>
            {isArmed ? "ARMED" : "DISARMED"}
          </span>
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <button
            onMouseDown={handleTakeoffDown}
            onMouseUp={handleTakeoffUp}
            onMouseLeave={handleTakeoffUp}
            onTouchStart={handleTakeoffDown}
            onTouchEnd={handleTakeoffUp}
            disabled={!canTakeoff}
            className={`flex-1 min-w-[60px] py-1.5 px-2 text-xs rounded-xl transition-all duration-300 flex items-center justify-center gap-1 relative overflow-hidden ${
              !canTakeoff
                ? "bg-white/[0.03] text-white/20 cursor-not-allowed"
                : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
            }`}
          >
            {takeoffHeld && (
              <div className="absolute inset-0 bg-emerald-500/30 animate-[fillRight_1.5s_linear]" style={{ animation: "fillRight 1.5s linear forwards" }} />
            )}
            <span className="relative z-10 flex items-center gap-1"><PlaneTakeoff size={14} /> {takeoffHeld ? "HOLD..." : !hasGpsFix ? "NO GPS FIX" : "TAKEOFF"}</span>
          </button>
          <button
            onClick={() => send({ type: "land" })}
            disabled={!isAirborne}
            className={`flex-1 min-w-[60px] py-1.5 px-2 text-xs rounded-xl transition-all duration-300 flex items-center justify-center gap-1 ${
              !isAirborne
                ? "bg-white/[0.03] text-white/20 cursor-not-allowed"
                : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 cursor-pointer"
            }`}
          >
            <PlaneLanding size={14} /> LAND
          </button>
          <button
            onClick={() => send({ type: "rth", start: true })}
            disabled={!isAirborne}
            className={`flex-1 min-w-[60px] py-1.5 px-2 text-xs rounded-xl transition-all duration-300 flex items-center justify-center gap-1 ${
              !isAirborne
                ? "bg-white/[0.03] text-white/20 cursor-not-allowed"
                : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer"
            }`}
          >
            <Home size={14} /> RTH
          </button>
          <button
            onClick={() => {
              if (confirm("Send EMERGENCY stop?")) send({ type: "emergency" });
            }}
            className="flex-1 min-w-[60px] py-1.5 px-2 text-xs bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500/20 transition-all duration-300 flex items-center justify-center gap-1 cursor-pointer"
          >
            <OctagonX size={14} /> EMRG
          </button>
        </div>
      </Section>

      {/* Battery */}
      <Section title="Battery" icon={<BatteryIcon pct={t.battery} />}>
        <Row
          label="Level"
          value={`${t.battery}%`}
          color={batteryColor(t.battery)}
        />
        <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden mt-1.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${batteryBarGradient(t.battery)}`}
            style={{ width: `${t.battery}%` }}
          />
        </div>
        <Row
          label="Voltage"
          value={t.voltage > 0 ? `${t.voltage.toFixed(1)}V` : "--"}
        />
      </Section>

      {/* GPS */}
      <Section title="GPS" icon={<Satellite size={12} />}>
        <Row
          label="Position"
          value={
            t.gps.lat !== 0 || t.gps.lon !== 0
              ? `${t.gps.lat.toFixed(6)}, ${t.gps.lon.toFixed(6)}`
              : "--, --"
          }
        />
        <div className="flex justify-between items-center py-0.5 text-[13px]">
          <span className="text-white/40 flex items-center gap-1">
            <MapPin size={10} /> Satellites
          </span>
          <span className={`font-semibold tabular-nums ${satsColor(t.gpsSats)}`}>
            {t.gpsSats}
          </span>
        </div>
      </Section>

      {/* Flight Data */}
      <Section title="Flight Data" icon={<Mountain size={12} />}>
        <Row label="Altitude" value={`${t.altitude} m`} />
        <div className="flex justify-between items-center py-0.5 text-[13px]">
          <span className="text-white/40 flex items-center gap-1">
            <Gauge size={10} /> Airspeed
          </span>
          <span className="font-semibold tabular-nums text-white/90">{t.airspeed} m/s</span>
        </div>
        <Row label="Groundspeed" value={`${t.groundspeed} m/s`} />
      </Section>

      {/* Attitude */}
      <Section title="Attitude" icon={<Compass size={12} />}>
        <AttitudeIndicator
          roll={t.attitude.roll}
          pitch={t.attitude.pitch}
        />
        <Row label="Roll" value={`${t.attitude.roll.toFixed(1)}\u00b0`} />
        <Row label="Pitch" value={`${t.attitude.pitch.toFixed(1)}\u00b0`} />
        <Row label="Heading" value={`${t.attitude.yaw.toFixed(1)}\u00b0`} />
      </Section>

      {/* Servo */}
      <Section title="Servo" icon={<Gauge size={12} />}>
        <Row label="Left" value={`${t.servoLeft} \u00b5s`} />
        <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden relative mb-1.5">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />
          <div
            className="h-full bg-cyan-500/60 rounded-full transition-all duration-100"
            style={{ width: `${(t.servoLeft - 1000) / 10}%` }}
          />
        </div>
        <Row label="Right" value={`${t.servoRight} \u00b5s`} />
        <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden relative">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />
          <div
            className="h-full bg-cyan-500/60 rounded-full transition-all duration-100"
            style={{ width: `${(t.servoRight - 1000) / 10}%` }}
          />
        </div>
      </Section>

      {/* 4G Signal */}
      <Section title="4G Signal" icon={<Signal size={12} />}>
        <Row
          label="RSSI"
          value={t.rssi || "--"}
          color={rssiColor(t.rssi)}
        />
        <Row label="RSRP" value={t.rsrp || "--"} />
        <Row label="RSRQ" value={t.rsrq || "--"} />
        <Row label="SINR" value={t.sinr || "--"} />
      </Section>

      {/* System */}
      <Section title="System" icon={<Thermometer size={12} />}>
        <Row
          label="Gyro Temp"
          value={t.gyroTemp > 0 ? `${t.gyroTemp.toFixed(1)}\u00b0C` : "--"}
        />
        <div className="flex justify-between items-center py-0.5 text-[13px]">
          <span className="text-white/40 flex items-center gap-1">
            <Camera size={10} /> Camera Tilt
          </span>
          <span className="font-semibold tabular-nums text-white/90">{t.cameraTilt}&deg;</span>
        </div>
      </Section>

    </div>
  );
}
