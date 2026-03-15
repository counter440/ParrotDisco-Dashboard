import { useState, useRef, useEffect } from "react";
import { Wifi, WifiOff, Settings, Route, Circle, Square, Download } from "lucide-react";

interface TopBarProps {
  connected: boolean;
  flyingState: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenConfig: () => void;
  onOpenFlightPlanner: () => void;
  isRecording: boolean;
  recordingSampleCount: number;
  recordingElapsed: number;
  hasRecordingData: boolean;
  onToggleRecording: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onClearRecording: () => void;
}

function stateColor(state: string): string {
  switch (state) {
    case "flying":
      return "bg-emerald-500/20 text-emerald-400";
    case "landed":
      return "bg-blue-500/20 text-blue-400";
    case "emergency":
    case "emergency_landing":
      return "bg-rose-500/20 text-rose-400 animate-pulse";
    case "disconnected":
      return "bg-white/[0.06] text-white/40";
    default:
      return "bg-amber-500/20 text-amber-400";
  }
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function TopBar({
  connected,
  flyingState,
  onConnect,
  onDisconnect,
  onOpenConfig,
  onOpenFlightPlanner,
  isRecording,
  recordingSampleCount,
  recordingElapsed,
  hasRecordingData,
  onToggleRecording,
  onExportJSON,
  onExportCSV,
  onClearRecording,
}: TopBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [exportOpen]);

  return (
    <div className="flex items-center justify-between px-5 h-14 bg-white/[0.04] backdrop-blur-xl border-b border-white/[0.08]">
      <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
        DISCO GCS
      </h1>
      <div className="flex items-center gap-3 text-[13px]">
        <span
          className={`rounded-full px-3 py-1 font-semibold text-xs uppercase ${stateColor(flyingState)}`}
        >
          {flyingState}
        </span>

        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              connected
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                : "bg-white/20"
            }`}
          />
          <span className={connected ? "text-white/90" : "text-white/40"}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        <button
          onClick={connected ? onDisconnect : onConnect}
          className="px-4 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white/70 hover:bg-white/[0.1] hover:text-white/90 transition-all duration-300 cursor-pointer"
        >
          {connected ? "Disconnect" : "Connect"}
        </button>

        {/* Flight Recorder */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleRecording}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-[12px] font-medium transition-all duration-300 cursor-pointer ${
              isRecording
                ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                : "bg-white/[0.06] border-white/[0.08] text-white/70 hover:bg-white/[0.1] hover:text-white/90"
            }`}
          >
            {isRecording ? (
              <>
                <Circle size={10} className="fill-rose-500 text-rose-500 animate-pulse" />
                REC {formatElapsed(recordingElapsed)}
                <span className="text-rose-400/60 text-[10px]">{recordingSampleCount}</span>
              </>
            ) : (
              <>
                <Circle size={10} />
                REC
              </>
            )}
          </button>

          {/* Export dropdown */}
          {(hasRecordingData || isRecording) && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="p-2 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white/50 hover:bg-white/[0.1] hover:text-white/90 transition-all duration-300 cursor-pointer"
              >
                <Download size={14} />
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1.5 bg-[#0f172a] border border-white/[0.12] rounded-xl shadow-xl z-50 overflow-hidden min-w-[140px]">
                  <button
                    onClick={() => { onExportJSON(); setExportOpen(false); }}
                    className="w-full text-left px-4 py-2 text-[12px] text-white/70 hover:bg-white/[0.08] hover:text-white/90 transition-colors cursor-pointer"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => { onExportCSV(); setExportOpen(false); }}
                    className="w-full text-left px-4 py-2 text-[12px] text-white/70 hover:bg-white/[0.08] hover:text-white/90 transition-colors cursor-pointer"
                  >
                    Export CSV
                  </button>
                  <div className="border-t border-white/[0.08]" />
                  <button
                    onClick={() => { onClearRecording(); setExportOpen(false); }}
                    className="w-full text-left px-4 py-2 text-[12px] text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    Clear data
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onOpenFlightPlanner}
          className="p-2 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white/50 hover:bg-white/[0.1] hover:text-white/90 transition-all duration-300 cursor-pointer"
        >
          <Route size={16} />
        </button>

        <button
          onClick={onOpenConfig}
          className="p-2 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white/50 hover:bg-white/[0.1] hover:text-white/90 transition-all duration-300 cursor-pointer"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}
