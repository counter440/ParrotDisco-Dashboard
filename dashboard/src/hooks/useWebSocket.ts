import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_TELEMETRY, type TelemetryData } from "../lib/types";

const WS_URL = `ws://${location.hostname || "localhost"}:8765`;
const VIDEO_WS_URL = `ws://${location.hostname || "localhost"}:8765/video`;

export function useWebSocket() {
  const [telemetry, setTelemetry] = useState<TelemetryData>(EMPTY_TELEMETRY);
  const [connected, setConnected] = useState(false);
  const [wsReady, setWsReady] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>(["Ready"]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFps, setVideoFps] = useState(0);
  const [homePoint, setHomePoint] = useState<{ lat: number; lon: number } | null>(null);
  const homeSetRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const connectedRef = useRef(false);
  const videoWsRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef(0);
  const prevBlobUrlRef = useRef<string | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogMessages((prev) => {
      const next = [...prev, msg];
      return next.length > 100 ? next.slice(-100) : next;
    });
  }, []);

  const send = useCallback(
    (msg: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(msg));
      }
    },
    []
  );

  const connectVideoWS = useCallback(() => {
    if (videoWsRef.current?.readyState === WebSocket.OPEN) return;

    const vws = new WebSocket(VIDEO_WS_URL);
    vws.binaryType = "arraybuffer";
    videoWsRef.current = vws;

    vws.onmessage = (e) => {
      const blob = new Blob([e.data], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
      prevBlobUrlRef.current = url;
      setVideoUrl(url);
      frameCountRef.current++;
    };

    vws.onclose = () => {
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) connectVideoWS();
      }, 2000);
    };
  }, []);

  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      addLog("WebSocket connected");
      setWsReady(true);
      // Only connect to drone if user explicitly clicked Connect
      if (pendingConnectRef.current) {
        pendingConnectRef.current = false;
        ws.send(JSON.stringify({ type: "connect" }));
      }
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "telemetry") {
          setTelemetry(msg.data);
          // Capture home point on first GPS fix
          if (
            !homeSetRef.current &&
            msg.data.gpsFixed &&
            (msg.data.gps.lat !== 0 || msg.data.gps.lon !== 0)
          ) {
            homeSetRef.current = true;
            setHomePoint({ lat: msg.data.gps.lat, lon: msg.data.gps.lon });
          }
          if (msg.data.connected && !connectedRef.current) {
            connectedRef.current = true;
            setConnected(true);
            addLog("Connected to Disco");
            connectVideoWS();
          }
        } else if (msg.type === "connectionStatus") {
          connectedRef.current = msg.connected;
          setConnected(msg.connected);
          if (msg.connected) {
            addLog("Connected to Disco");
            connectVideoWS();
          }
        } else if (msg.type === "flightplan_status") {
          addLog(`Flight plan ${msg.action}: ${msg.success ? "OK" : "FAILED"} — ${msg.filename}`);
        } else if (msg.type === "log" && msg.messages) {
          msg.messages.forEach((m: string) => addLog(m));
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      addLog("WebSocket disconnected");
      connectedRef.current = false;
      setConnected(false);
      setWsReady(false);
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {};
  }, [addLog, connectVideoWS]);

  const pendingConnectRef = useRef(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      send({ type: "connect" });
    } else {
      pendingConnectRef.current = true;
      connectWS();
    }
  }, [connectWS, send]);

  const disconnect = useCallback(() => {
    send({ type: "disconnect" });
    connectedRef.current = false;
    homeSetRef.current = false;
    setConnected(false);
    setHomePoint(null);
  }, [send]);

  // Auto-open WebSocket on mount (but don't connect to drone)
  useEffect(() => {
    connectWS();
  }, [connectWS]);

  // FPS counter
  useEffect(() => {
    const interval = setInterval(() => {
      setVideoFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      videoWsRef.current?.close();
      if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
    };
  }, []);

  return {
    telemetry,
    connected,
    wsReady,
    logMessages,
    videoUrl,
    videoFps,
    homePoint,
    send,
    connect,
    disconnect,
    addLog,
  };
}
