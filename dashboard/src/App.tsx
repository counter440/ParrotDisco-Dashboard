import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useGamepad } from "./hooks/useGamepad";
import { DEFAULT_CONFIG, type GamepadConfig } from "./lib/types";
import TopBar from "./components/TopBar";
import VideoPanel from "./components/VideoPanel";
import ControllerBar from "./components/ControllerBar";
import TelemetryPanel from "./components/TelemetryPanel";
import ConfigModal from "./components/ConfigModal";
import LogBar from "./components/LogBar";

export default function App() {
  const {
    telemetry,
    connected,
    logMessages,
    videoUrl,
    videoFps,
    send,
    connect,
    disconnect,
    addLog,
  } = useWebSocket();

  const [config, setConfig] = useState<GamepadConfig>(DEFAULT_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);

  const gpState = useGamepad(config, send);

  const handleSaveConfig = useCallback(
    (newConfig: GamepadConfig) => {
      setConfig(newConfig);
      addLog(`Config updated: deadzone=${Math.round(newConfig.deadzone * 100)}%`);
    },
    [addLog]
  );

  // Keyboard shortcuts
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "t" && e.ctrlKey) {
        e.preventDefault();
        send({ type: "takeoff" });
      }
      if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        send({ type: "land" });
      }
      if (e.key === "h" && e.ctrlKey) {
        e.preventDefault();
        send({ type: "rth", start: true });
      }
      if (e.key === "Escape") {
        send({ type: "emergency" });
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [send]);

  return (
    <div className="relative grid grid-rows-[56px_1fr_40px] h-screen bg-[#030712]">
      {/* Radial gradient bloom */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(56,189,248,0.08)_0%,rgba(59,130,246,0.04)_30%,transparent_70%)]" />

      <TopBar
        connected={connected}
        flyingState={telemetry.flyingState}
        onConnect={connect}
        onDisconnect={disconnect}
        onOpenConfig={() => setConfigOpen(true)}
      />

      <div className="grid grid-cols-[1fr_340px] overflow-hidden p-3 gap-3">
        {/* Left: Video + Controller */}
        <div className="flex flex-col gap-3 overflow-hidden">
          <VideoPanel videoUrl={videoUrl} fps={videoFps} telemetry={telemetry} />
          <ControllerBar gpState={gpState} config={config} />
        </div>

        {/* Right: Telemetry */}
        <TelemetryPanel telemetry={telemetry} send={send} />
      </div>

      <LogBar messages={logMessages} />

      <ConfigModal
        open={configOpen}
        config={config}
        onSave={handleSaveConfig}
        onClose={() => setConfigOpen(false)}
      />
    </div>
  );
}
