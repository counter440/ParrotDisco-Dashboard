import { Video, VideoOff } from "lucide-react";
import type { TelemetryData } from "../lib/types";
import VideoHUD from "./VideoHUD";
import MiniMap from "./MiniMap";

interface VideoPanelProps {
  videoUrl: string | null;
  fps: number;
  telemetry: TelemetryData;
}

export default function VideoPanel({ videoUrl, fps, telemetry }: VideoPanelProps) {
  return (
    <div className="flex-1 flex flex-col rounded-2xl overflow-hidden bg-black/40">
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {videoUrl ? (
          <img
            src={videoUrl}
            alt="Video Feed"
            className="max-w-full max-h-full object-contain"
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
        <div className="absolute top-3 left-3 bg-black/40 backdrop-blur rounded-full px-3 py-1 text-[11px] text-white/60 flex items-center gap-1.5 z-10">
          <Video size={12} />
          <span>{fps} fps</span>
        </div>
        <VideoHUD telemetry={telemetry} />
        <MiniMap lat={telemetry.gps.lat} lon={telemetry.gps.lon} heading={telemetry.attitude.yaw} gpsFixed={telemetry.gpsFixed} />
      </div>
    </div>
  );
}
