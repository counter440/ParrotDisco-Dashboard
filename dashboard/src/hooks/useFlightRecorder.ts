import { useCallback, useEffect, useRef, useState } from "react";
import type { TelemetryData } from "../lib/types";

export interface FlightRecord {
  /** Milliseconds since recording started */
  t: number;
  lat: number;
  lon: number;
  alt: number;
  altitude: number;
  airspeed: number;
  groundspeed: number;
  battery: number;
  roll: number;
  pitch: number;
  yaw: number;
  gpsSats: number;
  rssi: string;
  flyingState: string;
  speedX: number;
  speedY: number;
  speedZ: number;
  voltage: number;
}

export interface FlightRecorder {
  isRecording: boolean;
  /** Number of samples captured */
  sampleCount: number;
  /** Recording duration in seconds */
  elapsed: number;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  exportJSON: () => void;
  exportCSV: () => void;
  clear: () => void;
  hasData: boolean;
}

const SAMPLE_INTERVAL_MS = 500; // 2 Hz sampling

function snapshot(telemetry: TelemetryData, startTime: number): FlightRecord {
  return {
    t: Date.now() - startTime,
    lat: telemetry.gps.lat,
    lon: telemetry.gps.lon,
    alt: telemetry.gps.alt,
    altitude: telemetry.altitude,
    airspeed: telemetry.airspeed,
    groundspeed: telemetry.groundspeed,
    battery: telemetry.battery,
    roll: telemetry.attitude.roll,
    pitch: telemetry.attitude.pitch,
    yaw: telemetry.attitude.yaw,
    gpsSats: telemetry.gpsSats,
    rssi: telemetry.rssi,
    flyingState: telemetry.flyingState,
    speedX: telemetry.speedX,
    speedY: telemetry.speedY,
    speedZ: telemetry.speedZ,
    voltage: telemetry.voltage,
  };
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
}

export function useFlightRecorder(telemetry: TelemetryData): FlightRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const buffer = useRef<FlightRecord[]>([]);
  const startTime = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const telemetryRef = useRef(telemetry);

  // Keep telemetry ref current without re-triggering effects
  telemetryRef.current = telemetry;

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    buffer.current = [];
    startTime.current = Date.now();
    setSampleCount(0);
    setElapsed(0);
    setIsRecording(true);

    // Take first sample immediately
    buffer.current.push(snapshot(telemetryRef.current, startTime.current));
    setSampleCount(1);

    // Sample at fixed interval
    intervalRef.current = setInterval(() => {
      buffer.current.push(snapshot(telemetryRef.current, startTime.current));
      setSampleCount(buffer.current.length);
    }, SAMPLE_INTERVAL_MS);

    // Elapsed counter
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    // Final sample
    if (startTime.current) {
      buffer.current.push(snapshot(telemetryRef.current, startTime.current));
      setSampleCount(buffer.current.length);
    }
    setIsRecording(false);
  }, [clearTimers]);

  const toggle = useCallback(() => {
    if (isRecording) stop();
    else start();
  }, [isRecording, start, stop]);

  const exportJSON = useCallback(() => {
    if (buffer.current.length === 0) return;
    const data = {
      exportedAt: new Date().toISOString(),
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      samples: buffer.current.length,
      records: buffer.current,
    };
    triggerDownload(
      JSON.stringify(data, null, 2),
      `flight_${dateStamp()}.json`,
      "application/json"
    );
  }, []);

  const exportCSV = useCallback(() => {
    if (buffer.current.length === 0) return;
    const keys = Object.keys(buffer.current[0]) as (keyof FlightRecord)[];
    const header = keys.join(",");
    const rows = buffer.current.map((r) =>
      keys.map((k) => {
        const v = r[k];
        return typeof v === "string" ? `"${v}"` : v;
      }).join(",")
    );
    triggerDownload(
      [header, ...rows].join("\n"),
      `flight_${dateStamp()}.csv`,
      "text/csv"
    );
  }, []);

  const clear = useCallback(() => {
    clearTimers();
    buffer.current = [];
    startTime.current = 0;
    setSampleCount(0);
    setElapsed(0);
    setIsRecording(false);
  }, [clearTimers]);

  // Cleanup on unmount
  useEffect(() => clearTimers, [clearTimers]);

  return {
    isRecording,
    sampleCount,
    elapsed,
    start,
    stop,
    toggle,
    exportJSON,
    exportCSV,
    clear,
    hasData: buffer.current.length > 0,
  };
}
