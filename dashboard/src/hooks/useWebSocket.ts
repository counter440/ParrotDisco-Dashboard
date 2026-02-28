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

  const wsRef = useRef<WebSocket | null>(null);
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
      ws.send(JSON.stringify({ type: "connect" }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "telemetry") {
          setTelemetry(msg.data);
        } else if (msg.type === "connectionStatus") {
          setConnected(msg.connected);
          if (msg.connected) {
            addLog("Connected to Disco");
            connectVideoWS();
          }
        } else if (msg.type === "log" && msg.messages) {
          msg.messages.forEach((m: string) => addLog(m));
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      addLog("WebSocket disconnected");
      setConnected(false);
      setWsReady(false);
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {};
  }, [addLog, connectVideoWS]);

  const connect = useCallback(() => {
    connectWS();
  }, [connectWS]);

  const disconnect = useCallback(() => {
    send({ type: "disconnect" });
    setConnected(false);
  }, [send]);

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
    send,
    connect,
    disconnect,
    addLog,
  };
}
