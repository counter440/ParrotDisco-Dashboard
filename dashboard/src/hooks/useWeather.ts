import { useEffect, useRef, useState } from "react";

export interface WeatherData {
  windSpeed: number; // m/s
  windDirection: number; // degrees
  windGusts: number;
  temperature: number; // °C
}

export function useWeather(
  gpsLat: number,
  gpsLon: number,
  gpsFixed: boolean
): WeatherData | null {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const lastPos = useRef({ lat: 0, lon: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!gpsFixed || (gpsLat === 0 && gpsLon === 0)) return;

    // Skip if position hasn't changed significantly (~100m)
    const dLat = Math.abs(gpsLat - lastPos.current.lat);
    const dLon = Math.abs(gpsLon - lastPos.current.lon);
    const posChanged = dLat > 0.001 || dLon > 0.001;

    async function fetchWeather() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${gpsLat.toFixed(4)}&longitude=${gpsLon.toFixed(4)}&current=wind_speed_10m,wind_direction_10m,temperature_2m,wind_gusts_10m`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const c = data.current;
        if (c) {
          setWeather({
            windSpeed: c.wind_speed_10m ?? 0,
            windDirection: c.wind_direction_10m ?? 0,
            windGusts: c.wind_gusts_10m ?? 0,
            temperature: c.temperature_2m ?? 0,
          });
          lastPos.current = { lat: gpsLat, lon: gpsLon };
        }
      } catch {
        // Network error, keep stale data
      }
    }

    // Fetch immediately if position changed or no data yet
    if (posChanged || !weather) {
      fetchWeather();
    }

    // Poll every 60s
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchWeather, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [gpsFixed, gpsLat, gpsLon]); // eslint-disable-line react-hooks/exhaustive-deps

  return weather;
}
