import { SlidersHorizontal } from "lucide-react";

interface CalibrationPanelProps {
  send: (msg: Record<string, unknown>) => void;
}

export default function CalibrationPanel({ send }: CalibrationPanelProps) {
  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3 min-w-[220px]">
      <h2 className="text-[11px] uppercase tracking-widest text-white/40 font-medium mb-2 flex items-center gap-1.5">
        <SlidersHorizontal size={12} />
        Calibration
      </h2>
      <div className="flex gap-2">
        <button
          onClick={() => send({ type: "flat_trim" })}
          className="flex-1 py-1.5 px-2 text-xs bg-white/[0.06] text-white/60 rounded-xl hover:bg-white/[0.1] hover:text-white/80 transition-all duration-300 cursor-pointer text-center"
        >
          Flat Trim
        </button>
        <button
          onClick={() => send({ type: "magneto_cal", start: true })}
          className="flex-1 py-1.5 px-2 text-xs bg-white/[0.06] text-white/60 rounded-xl hover:bg-white/[0.1] hover:text-white/80 transition-all duration-300 cursor-pointer text-center"
        >
          Magneto
        </button>
        <button
          onClick={() => send({ type: "pitot_cal", start: true })}
          className="flex-1 py-1.5 px-2 text-xs bg-white/[0.06] text-white/60 rounded-xl hover:bg-white/[0.1] hover:text-white/80 transition-all duration-300 cursor-pointer text-center"
        >
          Pitot
        </button>
      </div>
    </div>
  );
}
