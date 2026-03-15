import { Video, VideoOff } from "lucide-react";
import type { TelemetryData, Alert } from "../lib/types";
import type { LiveStats } from "../hooks/useLiveStats";
import type { WeatherData } from "../hooks/useWeather";
import VideoHUD from "./VideoHUD";
import AlertBanner from "./AlertBanner";
import MiniMap from "./MiniMap";

interface VideoPanelProps {
  videoUrl: string | null;
  fps: number;
  telemetry: TelemetryData;
  liveStats: LiveStats;
  alerts: Alert[];
  weather: WeatherData | null;
  homePoint: { lat: number; lon: number } | null;
  videoEnabled: boolean;
  onToggleVideo: () => void;
}

export default function VideoPanel({ videoUrl, fps, telemetry, liveStats, alerts, weather, homePoint, videoEnabled, onToggleVideo }: VideoPanelProps) {
  return (
    <div className="flex-1 flex flex-col rounded-2xl overflow-hidden bg-black/40">
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {!videoEnabled ? (
          <div className="text-white/20 text-sm text-center flex flex-col items-center gap-2">
            <VideoOff size={48} />
            <div className="text-white/30">Video disabled</div>
            <div className="text-xs text-white/20">
              Enable camera to start stream
            </div>
          </div>
        ) : videoUrl ? (
          <img
            src={videoUrl}
            alt="Video Feed"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-white/20 text-sm text-center flex flex-col items-center gap-2">
            <VideoOff size={48} />
            <div className="text-white/30">No video</div>
            <div className="text-xs text-white/20">
              Connect to Disco to start stream
            </div>
          </div>
        )}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur rounded-full px-3 py-1 text-[11px] text-white/60 flex items-center gap-1.5 z-10">
          <Video size={12} />
          <span>{fps} fps</span>
        </div>
        <AlertBanner alerts={alerts} />
        <VideoHUD telemetry={telemetry} liveStats={liveStats} weather={weather} />
        <MiniMap lat={telemetry.gps.lat} lon={telemetry.gps.lon} heading={telemetry.attitude.yaw} gpsFixed={telemetry.gpsFixed} homePoint={homePoint} />
        {/* CAM toggle button */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          <button
            onClick={onToggleVideo}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium backdrop-blur cursor-pointer transition-all duration-200 ${
              videoEnabled
                ? "bg-cyan-500/30 text-cyan-300 border border-cyan-500/40"
                : "bg-rose-500/30 text-rose-300 border border-rose-500/40"
            }`}
          >
            {videoEnabled ? <Video size={14} /> : <VideoOff size={14} />}
            {videoEnabled ? "CAM ON" : "CAM OFF"}
          </button>
        </div>
      </div>
    </div>
  );
}
