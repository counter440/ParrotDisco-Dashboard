import { Wifi, WifiOff, Settings } from "lucide-react";

interface TopBarProps {
  connected: boolean;
  flyingState: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenConfig: () => void;
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

export default function TopBar({
  connected,
  flyingState,
  onConnect,
  onDisconnect,
  onOpenConfig,
}: TopBarProps) {
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
