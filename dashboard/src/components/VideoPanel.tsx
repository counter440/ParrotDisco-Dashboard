import { useState, useRef, useCallback } from "react";
import { Video, VideoOff, Crosshair, RotateCcw } from "lucide-react";
import type { TelemetryData } from "../lib/types";
import VideoHUD from "./VideoHUD";
import FlightPathHUD from "./FlightPathHUD";
import MiniMap from "./MiniMap";

interface VideoPanelProps {
  videoUrl: string | null;
  fps: number;
  telemetry: TelemetryData;
  hudEnabled: boolean;
  onToggleHud: () => void;
  homePoint: { lat: number; lon: number } | null;
  videoEnabled: boolean;
  onToggleVideo: () => void;
  send: (msg: Record<string, unknown>) => void;
}

export default function VideoPanel({ videoUrl, fps, telemetry, hudEnabled, onToggleHud, homePoint, videoEnabled, onToggleVideo, send }: VideoPanelProps) {
  const [cameraTilt, setCameraTilt] = useState(0);
  const [cameraPan, setCameraPan] = useState(0);
  const [ptzVisible, setPtzVisible] = useState(false);

  const sendCamera = useCallback((tilt: number, pan: number) => {
    setCameraTilt(tilt);
    setCameraPan(pan);
    send({ type: "camera", tilt, pan });
  }, [send]);

  const resetCamera = () => sendCamera(0, 0);
  return (
    <div className="flex-1 flex flex-col rounded-2xl overflow-hidden bg-black/40">
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {videoUrl ? (
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
        {hudEnabled && <FlightPathHUD telemetry={telemetry} />}
        <VideoHUD telemetry={telemetry} />
        <MiniMap lat={telemetry.gps.lat} lon={telemetry.gps.lon} heading={telemetry.attitude.yaw} gpsFixed={telemetry.gpsFixed} homePoint={homePoint} />
        {/* HUD toggle button */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          <button
            onClick={onToggleHud}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium backdrop-blur cursor-pointer transition-all duration-200 ${
              hudEnabled
                ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/40"
                : "bg-black/40 text-white/50 border border-white/10 hover:text-white/70"
            }`}
          >
            <Crosshair size={14} />
            {hudEnabled ? "HUD ON" : "HUD OFF"}
          </button>
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
