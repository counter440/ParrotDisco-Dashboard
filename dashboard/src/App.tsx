import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useGamepad } from "./hooks/useGamepad";
import { useLiveStats } from "./hooks/useLiveStats";
import { useAlerts } from "./hooks/useAlerts";
import { useWeather } from "./hooks/useWeather";
import { useFlightRecorder } from "./hooks/useFlightRecorder";
import { DEFAULT_CONFIG, type GamepadConfig } from "./lib/types";
import TopBar from "./components/TopBar";
import VideoPanel from "./components/VideoPanel";
import ControllerBar from "./components/ControllerBar";
import TelemetryPanel from "./components/TelemetryPanel";
import TestModePanel from "./components/TestModePanel";
import CalibrationPanel from "./components/CalibrationPanel";
import FlightPlannerModal from "./components/FlightPlannerModal";
import ConfigModal from "./components/ConfigModal";
import LogBar from "./components/LogBar";

export default function App() {
  const {
    telemetry,
    connected,
    logMessages,
    videoUrl,
    videoFps,
    homePoint,
    send,
    connect,
    disconnect,
    disableVideo,
    enableVideo,
    addLog,
  } = useWebSocket();

  const [config, setConfig] = useState<GamepadConfig>(DEFAULT_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);
  const [flightPlannerOpen, setFlightPlannerOpen] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const gpState = useGamepad(config, send);
  const liveStats = useLiveStats(telemetry, homePoint, connected);
  const alerts = useAlerts(telemetry);
  const weather = useWeather(telemetry.gps.lat, telemetry.gps.lon, telemetry.gpsFixed);
  const recorder = useFlightRecorder(telemetry);

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
        onOpenFlightPlanner={() => setFlightPlannerOpen(true)}
        isRecording={recorder.isRecording}
        recordingSampleCount={recorder.sampleCount}
        recordingElapsed={recorder.elapsed}
        hasRecordingData={recorder.hasData}
        onToggleRecording={recorder.toggle}
        onExportJSON={recorder.exportJSON}
        onExportCSV={recorder.exportCSV}
        onClearRecording={recorder.clear}
      />

      <div className="grid grid-cols-[1fr_340px] overflow-hidden p-3 gap-3">
        {/* Left: Video + Controller */}
        <div className="flex flex-col gap-3 overflow-hidden">
          <VideoPanel videoUrl={videoUrl} fps={videoFps} telemetry={telemetry} liveStats={liveStats} alerts={alerts} weather={weather} homePoint={homePoint} videoEnabled={videoEnabled} onToggleVideo={() => {
            const next = !videoEnabled;
            setVideoEnabled(next);
            send({ type: "video_enable", enable: next });
            if (!next) {
              disableVideo();
            } else {
              enableVideo();
            }
          }} />
          <div className="flex gap-3">
            <ControllerBar gpState={gpState} config={config} />
            <TestModePanel send={send} gpState={gpState} />
            <CalibrationPanel send={send} />
          </div>
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

      <FlightPlannerModal
        open={flightPlannerOpen}
        onClose={() => setFlightPlannerOpen(false)}
        send={send}
        flyingState={telemetry.flyingState}
        dronePosition={
          telemetry.gpsFixed && (telemetry.gps.lat !== 0 || telemetry.gps.lon !== 0)
            ? { lat: telemetry.gps.lat, lon: telemetry.gps.lon }
            : homePoint
        }
      />
    </div>
  );
}
