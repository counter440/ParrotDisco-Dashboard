import { Gamepad2 } from "lucide-react";
import type { GamepadConfig, GamepadState } from "../lib/types";

interface ControllerBarProps {
  gpState: GamepadState;
  config: GamepadConfig;
}

function StickViz({ x, y, label }: { x: number; y: number; label: string }) {
  const dotX = 50 + x * 40;
  const dotY = 50 + y * 40;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-white/40">{label}</span>
      <div className="w-14 h-14 bg-white/[0.06] border border-white/[0.08] rounded-xl relative">
        {/* Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-full h-px bg-white/[0.08]" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-px h-full bg-white/[0.08]" />
        </div>
        {/* Dot */}
        <div
          className="absolute w-2.5 h-2.5 bg-cyan-400 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_8px_rgba(6,182,212,0.6)] transition-all duration-[50ms]"
          style={{ left: `${dotX}%`, top: `${dotY}%` }}
        />
      </div>
    </div>
  );
}

export default function ControllerBar({ gpState, config }: ControllerBarProps) {
  const { pcmd, rawAxes, buttons, name, connected } = gpState;

  const leftX = rawAxes[config.axisRoll] ?? 0;
  const leftY = rawAxes[config.axisPitch] ?? 0;
  const rightX = rawAxes[config.axisYaw] ?? 0;

  const btnLabels = ["A", "B", "X", "Y"];

  return (
    <div className="px-4 py-3 bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl flex items-center gap-5 flex-wrap text-[13px]">
      <div className="flex items-center gap-2 text-white/40">
        <Gamepad2 size={16} />
        <span className={connected ? "text-white/90" : ""}>{name}</span>
      </div>

      <div className="flex gap-3">
        <StickViz x={leftX} y={leftY} label="L" />
        <StickViz x={rightX} y={0} label="R" />
      </div>

      <div className="flex gap-4 text-white/40 font-mono text-[12px]">
        <span>
          Roll <span className="text-cyan-400 font-semibold tabular-nums inline-block w-[36px] text-right">{pcmd.roll}</span>
        </span>
        <span>
          Pitch <span className="text-cyan-400 font-semibold tabular-nums inline-block w-[36px] text-right">{pcmd.pitch}</span>
        </span>
        <span>
          Yaw <span className="text-cyan-400 font-semibold tabular-nums inline-block w-[36px] text-right">{pcmd.yaw}</span>
        </span>
        <span>
          Gaz <span className="text-cyan-400 font-semibold tabular-nums inline-block w-[36px] text-right">{pcmd.gaz}</span>
        </span>
      </div>

      <div className="flex gap-1.5">
        {btnLabels.map((label, i) => (
          <div
            key={label}
            className={`w-6 h-6 rounded-lg text-[10px] flex items-center justify-center transition-all duration-300 ${
              buttons[i]
                ? "bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                : "bg-white/[0.06] text-white/30 border border-white/[0.08]"
            }`}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
