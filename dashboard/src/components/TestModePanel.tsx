import { useState, useRef, useEffect } from "react";
import { AlertTriangle, Wrench, Power } from "lucide-react";
import type { GamepadState } from "../lib/types";

interface TestModePanelProps {
  send: (msg: Record<string, unknown>) => void;
  gpState: GamepadState;
}

export default function TestModePanel({ send, gpState }: TestModePanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [motorEnabled, setMotorEnabled] = useState(false);
  const [confirmingEnable, setConfirmingEnable] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holdProgress, setHoldProgress] = useState(false);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use refs so the interval always reads the latest values
  const gpStateRef = useRef(gpState);
  const sendRef = useRef(send);
  const motorEnabledRef = useRef(motorEnabled);
  gpStateRef.current = gpState;
  sendRef.current = send;
  motorEnabledRef.current = motorEnabled;

  const handleEnable = () => {
    if (enabled) {
      send({ type: "test_mode", enable: false });
      setEnabled(false);
      setMotorEnabled(false);
      stopSending();
      return;
    }
    setConfirmingEnable(true);
  };

  const handleConfirmEnable = () => {
    send({ type: "test_mode", enable: true });
    setEnabled(true);
    setConfirmingEnable(false);
  };

  const handleMotorDown = () => {
    if (!enabled) return;
    if (motorEnabledRef.current) {
      // Instant disable — no hold needed
      sendRef.current({ type: "test_motor_enable", enable: false });
      setMotorEnabled(false);
      return;
    }
    // Hold 2s to enable
    setHoldProgress(true);
    holdTimerRef.current = setTimeout(() => {
      sendRef.current({ type: "test_motor_enable", enable: true });
      setMotorEnabled(true);
      setHoldProgress(false);
    }, 2000);
  };

  const handleMotorUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress(false);
  };

  const stopSending = () => {
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
  };

  // Start/stop the send interval when enabled changes
  useEffect(() => {
    if (enabled) {
      if (sendIntervalRef.current) return;
      sendIntervalRef.current = setInterval(() => {
        const gp = gpStateRef.current;
        const s = sendRef.current;
        const roll = gp.pcmd.roll;
        const pitch = gp.pcmd.pitch;
        const left = Math.max(-100, Math.min(100, roll + pitch));
        const right = Math.max(-100, Math.min(100, -roll + pitch));
        const throttle = motorEnabledRef.current ? Math.max(0, gp.pcmd.gaz) : -1;
        s({ type: "test_pwm", left, right, throttle });
      }, 100); // 10Hz — fast enough for testing, avoids flooding telnet
    } else {
      stopSending();
    }
    return () => stopSending();
  }, [enabled]);

  // Computed values for display
  const leftServo = Math.max(-100, Math.min(100, gpState.pcmd.roll + gpState.pcmd.pitch));
  const rightServo = Math.max(-100, Math.min(100, -gpState.pcmd.roll + gpState.pcmd.pitch));
  const motorVal = motorEnabled ? Math.max(0, gpState.pcmd.gaz) : 0;

  return (
    <div className={`bg-white/[0.04] backdrop-blur-xl border rounded-2xl p-3 min-w-[260px] ${enabled ? "border-amber-500/30" : "border-white/[0.08]"}`}>
      <h2 className="text-[11px] uppercase tracking-widest text-white/40 font-medium mb-2 flex items-center gap-1.5">
        <Wrench size={12} />
        Ground Test
      </h2>

      {confirmingEnable && !enabled && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-2">
          <div className="flex items-start gap-2 text-amber-400 text-[11px]">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold mb-1">Direct hardware control</div>
              <div className="text-amber-400/70">
                Bypasses flight controller. Remove props before motor test.
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleConfirmEnable}
                  className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-lg text-[11px] hover:bg-amber-500/30 cursor-pointer"
                >
                  Enable
                </button>
                <button
                  onClick={() => setConfirmingEnable(false)}
                  className="px-3 py-1 bg-white/[0.06] text-white/50 rounded-lg text-[11px] hover:text-white/70 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleEnable}
          className={`flex-1 py-1.5 px-2 text-xs rounded-xl transition-all duration-300 flex items-center justify-center gap-1 cursor-pointer ${
            enabled
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : "bg-white/[0.06] text-white/40 hover:text-white/60"
          }`}
        >
          <Power size={14} />
          {enabled ? "DISABLE" : "ENABLE"}
        </button>

        {enabled && (
          <button
            onMouseDown={handleMotorDown}
            onMouseUp={handleMotorUp}
            onMouseLeave={handleMotorUp}
            onTouchStart={handleMotorDown}
            onTouchEnd={handleMotorUp}
            className={`flex-1 py-1.5 px-2 text-xs rounded-xl transition-all duration-300 flex items-center justify-center gap-1 cursor-pointer relative overflow-hidden ${
              motorEnabled
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                : "bg-white/[0.06] text-white/40 hover:text-white/60"
            }`}
          >
            {holdProgress && !motorEnabled && (
              <div className="absolute inset-0 bg-rose-500/20" style={{ animation: "fillRight 2s linear forwards" }} />
            )}
            <span className="relative z-10 flex items-center gap-1">
              <AlertTriangle size={12} />
              {motorEnabled ? "MOTOR ON" : holdProgress ? "HOLD..." : "ARM MOTOR"}
            </span>
          </button>
        )}
      </div>

      {enabled && (
        <div className="grid grid-cols-3 gap-0 mt-2 text-[11px] font-mono">
          <div className="text-white/40">
            L <span className="text-white/70 inline-block w-[40px] text-right">{leftServo}%</span>
          </div>
          <div className="text-white/40">
            R <span className="text-white/70 inline-block w-[40px] text-right">{rightServo}%</span>
          </div>
          <div className="text-white/40">
            M <span className={`inline-block w-[40px] text-right ${motorEnabled ? "text-rose-400" : "text-white/70"}`}>{motorVal}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
