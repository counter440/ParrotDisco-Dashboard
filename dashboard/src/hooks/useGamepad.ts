import { useCallback, useEffect, useRef, useState } from "react";
import { type GamepadConfig, type GamepadState } from "../lib/types";

function applyDeadzone(val: number, dz: number): number {
  if (Math.abs(val) < dz) return 0;
  return (val - Math.sign(val) * dz) / (1 - dz);
}

export function useGamepad(
  config: GamepadConfig,
  send: (msg: Record<string, unknown>) => void
) {
  const [gpState, setGpState] = useState<GamepadState>({
    name: "None",
    connected: false,
    pcmd: { flag: 0, roll: 0, pitch: 0, yaw: 0, gaz: 0 },
    rawAxes: [],
    buttons: [],
  });

  const lastBtnStateRef = useRef<Record<number, boolean>>({});
  const cameraTiltRef = useRef(0);
  const cameraPanRef = useRef(0);
  const cameraSendRef = useRef(0);
  const configRef = useRef(config);
  const sendRef = useRef(send);
  const lastSendTimeRef = useRef(0);

  // Keep refs up to date
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const pollGamepad = useCallback(() => {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const g of gamepads) {
      if (g?.connected) {
        gp = g;
        break;
      }
    }

    const cfg = configRef.current;
    const sendFn = sendRef.current;

    if (!gp) {
      setGpState({
        name: "None",
        connected: false,
        pcmd: { flag: 0, roll: 0, pitch: 0, yaw: 0, gaz: 0 },
        rawAxes: [],
        buttons: [],
      });
      return;
    }

    const rawRoll = gp.axes[cfg.axisRoll] ?? 0;
    const rawPitch = gp.axes[cfg.axisPitch] ?? 0;
    const rawYaw = gp.axes[cfg.axisYaw] ?? 0;

    const roll = Math.round(applyDeadzone(rawRoll, cfg.deadzone) * 100);
    const pitch = Math.round(applyDeadzone(rawPitch, cfg.deadzone) * 100);
    const yaw = Math.round(applyDeadzone(rawYaw, cfg.deadzone) * 100);

    let gaz = 0;
    if (cfg.throttleSrc === "rt") {
      const rt = gp.buttons[7]?.value ?? 0;
      const lt = gp.buttons[6]?.value ?? 0;
      gaz = Math.round((rt - lt) * 100);
    } else {
      const axIdx = parseInt(cfg.throttleSrc);
      gaz = Math.round(applyDeadzone(gp.axes[axIdx] ?? 0, cfg.deadzone) * -100);
    }

    const flag = roll !== 0 || pitch !== 0 || yaw !== 0 || gaz !== 0 ? 1 : 0;
    const pcmd = { flag, roll, pitch, yaw, gaz };

    // Button edge detection
    function btnPressed(idx: number): boolean {
      const cur = gp!.buttons[idx]?.pressed ?? false;
      const prev = lastBtnStateRef.current[idx] ?? false;
      lastBtnStateRef.current[idx] = cur;
      return cur && !prev;
    }

    if (btnPressed(cfg.btnTakeoff)) sendFn({ type: "takeoff" });
    if (btnPressed(cfg.btnLand)) sendFn({ type: "land" });
    if (btnPressed(cfg.btnRTH)) sendFn({ type: "rth", start: true });
    if (btnPressed(cfg.btnEmergency)) sendFn({ type: "emergency" });

    // D-pad camera tilt (throttled to ~5Hz)
    const dpadUp = gp.buttons[12]?.pressed ?? false;
    const dpadDown = gp.buttons[13]?.pressed ?? false;
    const dpadLeft = gp.buttons[14]?.pressed ?? false;
    const dpadRight = gp.buttons[15]?.pressed ?? false;
    const now = performance.now();
    if ((dpadUp || dpadDown || dpadLeft || dpadRight) && now - (cameraSendRef.current ?? 0) >= 200) {
      if (dpadUp) cameraTiltRef.current = Math.min(cameraTiltRef.current + 5, 80);
      if (dpadDown) cameraTiltRef.current = Math.max(cameraTiltRef.current - 5, -80);
      if (dpadRight) cameraPanRef.current = Math.min(cameraPanRef.current + 5, 80);
      if (dpadLeft) cameraPanRef.current = Math.max(cameraPanRef.current - 5, -80);
      sendFn({ type: "camera", tilt: cameraTiltRef.current, pan: cameraPanRef.current });
      cameraSendRef.current = now;
    }

    // Send PCMD at 25Hz
    if (now - lastSendTimeRef.current >= 40) {
      sendFn({ type: "pcmd", ...pcmd });
      lastSendTimeRef.current = now;
    }

    const rawAxes = Array.from(gp.axes);
    const buttons = Array.from(gp.buttons).map((b) => b.pressed);

    setGpState({
      name: gp.id.substring(0, 30),
      connected: true,
      pcmd,
      rawAxes,
      buttons,
    });
  }, []);

  // Animation frame loop
  useEffect(() => {
    let raf: number;
    function loop() {
      pollGamepad();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pollGamepad]);

  return gpState;
}
