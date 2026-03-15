import { useEffect, useRef, useState } from "react";
import { DEFAULT_ALERT_CONFIG } from "../lib/types";
import type { TelemetryData, Alert, AlertConfig } from "../lib/types";

function playTone(frequency: number, duration: number, repeat = 1) {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < repeat; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = "square";
      gain.gain.value = 0.15;
      const start = ctx.currentTime + i * (duration + 0.05);
      osc.start(start);
      osc.stop(start + duration);
    }
  } catch {
    // Audio not available
  }
}

interface AlertState {
  batteryWarn: boolean;
  batteryCrit: boolean;
  rssiWarn: boolean;
  altWarn: boolean;
  gpsWarn: boolean;
}

export function useAlerts(
  telemetry: TelemetryData,
  config: AlertConfig = DEFAULT_ALERT_CONFIG
): Alert[] {
  const prev = useRef<AlertState>({
    batteryWarn: false,
    batteryCrit: false,
    rssiWarn: false,
    altWarn: false,
    gpsWarn: false,
  });

  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const now: Alert[] = [];
    const p = prev.current;

    const flying =
      telemetry.flyingState === "flying" || telemetry.flyingState === "hovering";

    // Battery critical
    const batteryCrit = telemetry.battery > 0 && telemetry.battery <= config.batteryCritical;
    if (batteryCrit) {
      now.push({ id: "bat-crit", message: `Battery critical: ${telemetry.battery}%`, severity: "critical" });
      if (!p.batteryCrit) playTone(1000, 0.12, 3);
    }
    // Battery warning (only if not critical)
    const batteryWarn = !batteryCrit && telemetry.battery > 0 && telemetry.battery <= config.batteryWarn;
    if (batteryWarn) {
      now.push({ id: "bat-warn", message: `Battery low: ${telemetry.battery}%`, severity: "warning" });
      if (!p.batteryWarn) playTone(800, 0.2, 1);
    }

    // RSSI
    const rssiVal = parseInt(telemetry.rssi);
    const rssiWarn = !isNaN(rssiVal) && rssiVal < config.rssiMin;
    if (rssiWarn) {
      now.push({ id: "rssi", message: `Weak signal: ${telemetry.rssi} dBm`, severity: "warning" });
      if (!p.rssiWarn) playTone(800, 0.2, 1);
    }

    // Altitude
    const altWarn = telemetry.altitude > config.altitudeMax;
    if (altWarn) {
      now.push({ id: "alt", message: `Altitude high: ${telemetry.altitude}m (>${config.altitudeMax}m)`, severity: "warning" });
      if (!p.altWarn) playTone(800, 0.2, 1);
    }

    // GPS sats while flying
    const gpsWarn = flying && telemetry.gpsSats < config.gpsSatsMin;
    if (gpsWarn) {
      now.push({ id: "gps", message: `Low GPS: ${telemetry.gpsSats} sats`, severity: "critical" });
      if (!p.gpsWarn) playTone(1000, 0.12, 3);
    }

    prev.current = { batteryWarn, batteryCrit, rssiWarn, altWarn, gpsWarn };
    setAlerts(now);
  }, [
    telemetry.battery,
    telemetry.rssi,
    telemetry.altitude,
    telemetry.gpsSats,
    telemetry.flyingState,
    config,
  ]);

  return alerts;
}
