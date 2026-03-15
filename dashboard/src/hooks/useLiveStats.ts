import { useEffect, useRef, useState } from "react";
import type { TelemetryData } from "../lib/types";

export interface LiveStats {
  flightTime: string; // MM:SS
  distanceFromHome: number; // metres
  maxAltitude: number;
  maxSpeed: number;
}

function haversineMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useLiveStats(
  telemetry: TelemetryData,
  homePoint: { lat: number; lon: number } | null,
  connected: boolean
): LiveStats {
  const [elapsed, setElapsed] = useState(0); // seconds
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxAlt = useRef(0);
  const maxSpd = useRef(0);

  const flying =
    telemetry.flyingState === "flying" || telemetry.flyingState === "hovering";

  // Timer management
  useEffect(() => {
    if (flying && !timerRef.current) {
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (!flying && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [flying]);

  // Reset on disconnect
  useEffect(() => {
    if (!connected) {
      setElapsed(0);
      maxAlt.current = 0;
      maxSpd.current = 0;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [connected]);

  // Track maxes
  if (telemetry.altitude > maxAlt.current) maxAlt.current = telemetry.altitude;
  if (telemetry.groundspeed > maxSpd.current)
    maxSpd.current = telemetry.groundspeed;

  // Distance from home
  let distance = 0;
  if (
    homePoint &&
    telemetry.gpsFixed &&
    (telemetry.gps.lat !== 0 || telemetry.gps.lon !== 0)
  ) {
    distance = haversineMetres(
      homePoint.lat,
      homePoint.lon,
      telemetry.gps.lat,
      telemetry.gps.lon
    );
  }

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const flightTime = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return {
    flightTime,
    distanceFromHome: Math.round(distance),
    maxAltitude: maxAlt.current,
    maxSpeed: maxSpd.current,
  };
}
