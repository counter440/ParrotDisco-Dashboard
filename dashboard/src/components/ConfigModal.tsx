import { Settings } from "lucide-react";
import type { GamepadConfig } from "../lib/types";

interface ConfigModalProps {
  open: boolean;
  config: GamepadConfig;
  onSave: (config: GamepadConfig) => void;
  onClose: () => void;
}

export default function ConfigModal({
  open,
  config,
  onSave,
  onClose,
}: ConfigModalProps) {
  if (!open) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const updated: GamepadConfig = {
      deadzone: parseInt(fd.get("deadzone") as string) / 100,
      axisRoll: parseInt(fd.get("axisRoll") as string),
      axisPitch: parseInt(fd.get("axisPitch") as string),
      axisYaw: parseInt(fd.get("axisYaw") as string),
      throttleSrc: fd.get("throttleSrc") as string,
      btnTakeoff: parseInt(fd.get("btnTakeoff") as string),
      btnLand: parseInt(fd.get("btnLand") as string),
      btnRTH: parseInt(fd.get("btnRTH") as string),
      btnEmergency: parseInt(fd.get("btnEmergency") as string),
    };
    onSave(updated);
    onClose();
  }

  const selClass =
    "w-full p-2 bg-white/[0.06] border border-white/[0.1] text-white/90 text-[13px] rounded-xl mt-1 focus:outline-none focus:ring-2 focus:ring-cyan-400/50";
  const labelClass = "block text-[13px] text-white/40 mt-3";

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white/[0.06] backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-6 min-w-[400px] max-w-[600px] max-h-[80vh] overflow-y-auto"
      >
        <h2 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-4 flex items-center gap-2">
          <Settings size={18} className="text-cyan-400" /> Controller Configuration
        </h2>

        {/* Deadzone */}
        <label className={labelClass}>Deadzone (%)</label>
        <div className="flex items-center gap-3 mt-1">
          <input
            type="range"
            name="deadzone"
            min="0"
            max="40"
            defaultValue={Math.round(config.deadzone * 100)}
            className="flex-1"
            onChange={(e) => {
              const span = e.currentTarget.parentElement?.querySelector("span");
              if (span) span.textContent = `${e.currentTarget.value}%`;
            }}
          />
          <span className="text-[13px] text-white/50 w-10 tabular-nums">
            {Math.round(config.deadzone * 100)}%
          </span>
        </div>

        {/* Axis Mapping */}
        <h3 className="text-[11px] uppercase tracking-widest text-white/40 font-medium mt-5 mb-2">
          Axis Mapping
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Roll</label>
            <select name="axisRoll" defaultValue={config.axisRoll} className={selClass}>
              <option value="0">Left Stick X (0)</option>
              <option value="2">Right Stick X (2)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Pitch</label>
            <select name="axisPitch" defaultValue={config.axisPitch} className={selClass}>
              <option value="1">Left Stick Y (1)</option>
              <option value="3">Right Stick Y (3)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Yaw</label>
            <select name="axisYaw" defaultValue={config.axisYaw} className={selClass}>
              <option value="2">Right Stick X (2)</option>
              <option value="0">Left Stick X (0)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Throttle (+)</label>
            <select name="throttleSrc" defaultValue={config.throttleSrc} className={selClass}>
              <option value="rt">Right Trigger</option>
              <option value="3">Right Stick Y (3)</option>
            </select>
          </div>
        </div>

        {/* Button Mapping */}
        <h3 className="text-[11px] uppercase tracking-widest text-white/40 font-medium mt-5 mb-2">
          Button Mapping
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Takeoff</label>
            <select name="btnTakeoff" defaultValue={config.btnTakeoff} className={selClass}>
              <option value="0">A (0)</option>
              <option value="1">B (1)</option>
              <option value="2">X (2)</option>
              <option value="3">Y (3)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Land</label>
            <select name="btnLand" defaultValue={config.btnLand} className={selClass}>
              <option value="1">B (1)</option>
              <option value="0">A (0)</option>
              <option value="2">X (2)</option>
              <option value="3">Y (3)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>RTH</label>
            <select name="btnRTH" defaultValue={config.btnRTH} className={selClass}>
              <option value="3">Y (3)</option>
              <option value="0">A (0)</option>
              <option value="1">B (1)</option>
              <option value="2">X (2)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Emergency</label>
            <select name="btnEmergency" defaultValue={config.btnEmergency} className={selClass}>
              <option value="9">Start (9)</option>
              <option value="8">Back (8)</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="mt-5 w-full px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-semibold hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all duration-300 cursor-pointer"
        >
          Save & Close
        </button>
      </form>
    </div>
  );
}
