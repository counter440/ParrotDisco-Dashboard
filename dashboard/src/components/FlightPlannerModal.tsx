import { useState, useCallback, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, LayersControl } from "react-leaflet";
import L from "leaflet";
import { X, Trash2, Upload, Pause, Square, Route, Locate, LocateOff } from "lucide-react";
import { type Waypoint, DEFAULT_ALTITUDE } from "../lib/types";
import "leaflet/dist/leaflet.css";

interface FlightPlannerModalProps {
  open: boolean;
  onClose: () => void;
  send: (msg: Record<string, unknown>) => void;
  dronePosition: { lat: number; lon: number } | null;
  flyingState: string;
}

function waypointIcon(index: number) {
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#06b6d4;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.5);">${index + 1}</div>`,
  });
}

const droneIcon = L.divIcon({
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#22d3ee;border:2px solid #fff;box-shadow:0 0 8px rgba(34,211,238,0.6);"></div>`,
});

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapFollower({ lat, lon, follow }: { lat: number; lon: number; follow: boolean }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (follow && lat !== 0 && lon !== 0) {
      map.panTo([lat, lon], { animate: true, duration: 0.5 });
    }
  }, [lat, lon, follow, map]);
  return null;
}

function generateMavlinkWPL(waypoints: Waypoint[]): string {
  const lines = ["QGC WPL 110"];
  waypoints.forEach((wp, i) => {
    const current = i === 0 ? 1 : 0;
    lines.push(
      `${i}\t${current}\t0\t16\t0\t0\t0\t0\t${wp.lat.toFixed(7)}\t${wp.lon.toFixed(7)}\t${wp.altitude.toFixed(6)}\t1`
    );
  });
  return lines.join("\n") + "\n";
}

export default function FlightPlannerModal({ open, onClose, send, dronePosition, flyingState }: FlightPlannerModalProps) {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [defaultAlt, setDefaultAlt] = useState(DEFAULT_ALTITUDE);
  const [planName, setPlanName] = useState("plan.mavlink");
  const [uploading, setUploading] = useState(false);
  const [followDrone, setFollowDrone] = useState(false);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const lastTrailRef = useRef<{ lat: number; lon: number } | null>(null);

  // Build drone trail from live position updates
  useEffect(() => {
    if (!dronePosition || (dronePosition.lat === 0 && dronePosition.lon === 0)) return;
    const last = lastTrailRef.current;
    if (!last || Math.abs(last.lat - dronePosition.lat) > 0.00001 || Math.abs(last.lon - dronePosition.lon) > 0.00001) {
      lastTrailRef.current = { lat: dronePosition.lat, lon: dronePosition.lon };
      setTrail((prev) => {
        const next = [...prev, [dronePosition.lat, dronePosition.lon] as [number, number]];
        return next.length > 2000 ? next.slice(-2000) : next;
      });
    }
  }, [dronePosition]);

  const addWaypoint = useCallback((lat: number, lon: number) => {
    setWaypoints((prev) => [
      ...prev,
      { id: crypto.randomUUID(), lat, lon, altitude: defaultAlt },
    ]);
  }, [defaultAlt]);

  const removeWaypoint = (id: string) => {
    setWaypoints((prev) => prev.filter((w) => w.id !== id));
  };

  const updateAltitude = (id: string, alt: number) => {
    setWaypoints((prev) =>
      prev.map((w) => (w.id === id ? { ...w, altitude: alt } : w))
    );
  };

  const clearAll = () => setWaypoints([]);

  const isAirborne = flyingState === "flying" || flyingState === "hovering";
  const canStart = waypoints.length >= 2 && isAirborne && !uploading;

  const handleUploadAndStart = () => {
    if (!canStart) return;
    setUploading(true);
    const content = generateMavlinkWPL(waypoints);
    send({ type: "flightplan_upload", filename: planName, content });
    setTimeout(() => {
      send({ type: "mavlink_start", filename: planName });
      setUploading(false);
    }, 2000);
  };

  const center: [number, number] = dronePosition
    ? [dronePosition.lat, dronePosition.lon]
    : waypoints.length > 0
    ? [waypoints[0].lat, waypoints[0].lon]
    : [48.8566, 2.3522];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex">
      {/* Sidebar */}
      <div className="w-[280px] bg-[#0a0e14] border-r border-white/[0.08] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
          <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
            <Route size={16} />
            Flight Planner
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-white/40 hover:text-white/90 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Settings */}
        <div className="p-4 border-b border-white/[0.08] space-y-3">
          <div>
            <label className="text-[11px] text-white/40 uppercase tracking-wider">Plan Name</label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white/90 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-white/40 uppercase tracking-wider">Default Altitude (m)</label>
            <input
              type="number"
              value={defaultAlt}
              onChange={(e) => setDefaultAlt(Number(e.target.value) || DEFAULT_ALTITUDE)}
              min={10}
              max={500}
              className="w-full mt-1 px-2 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white/90 text-xs font-mono"
            />
          </div>
        </div>

        {/* Waypoint list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {waypoints.length === 0 && (
            <div className="text-white/20 text-xs text-center py-8">
              Click on the map to add waypoints
            </div>
          )}
          {waypoints.map((wp, i) => (
            <div
              key={wp.id}
              className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-2.5"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-cyan-500 text-white text-[11px] font-bold flex items-center justify-center">
                    {i + 1}
                  </div>
                  <span className="text-[11px] text-white/50 font-mono">
                    {wp.lat.toFixed(5)}, {wp.lon.toFixed(5)}
                  </span>
                </div>
                <button
                  onClick={() => removeWaypoint(wp.id)}
                  className="p-1 text-white/30 hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-white/30">Alt</label>
                <input
                  type="number"
                  value={wp.altitude}
                  onChange={(e) => updateAltitude(wp.id, Number(e.target.value) || defaultAlt)}
                  min={10}
                  max={500}
                  className="flex-1 px-2 py-1 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white/80 text-[11px] font-mono"
                />
                <span className="text-[10px] text-white/30">m</span>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-3 border-t border-white/[0.08] space-y-2">
          <div className="flex gap-2">
            <button
              onClick={handleUploadAndStart}
              disabled={!canStart}
              className={`flex-1 py-2 px-3 text-xs rounded-xl flex items-center justify-center gap-1.5 font-medium transition-all cursor-pointer ${
                !canStart
                  ? "bg-white/[0.03] text-white/20 cursor-not-allowed"
                  : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
              }`}
            >
              <Upload size={14} />
              {uploading ? "Uploading..." : !isAirborne ? "Takeoff first" : waypoints.length < 2 ? "Need 2+ waypoints" : "Upload & Start"}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => send({ type: "mavlink_pause" })}
              className="flex-1 py-1.5 px-2 text-xs bg-amber-500/10 text-amber-400 rounded-xl hover:bg-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <Pause size={12} /> Pause
            </button>
            <button
              onClick={() => send({ type: "mavlink_stop" })}
              className="flex-1 py-1.5 px-2 text-xs bg-rose-500/10 text-rose-400 rounded-xl hover:bg-rose-500/20 transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <Square size={12} /> Stop
            </button>
            <button
              onClick={clearAll}
              className="flex-1 py-1.5 px-2 text-xs bg-white/[0.06] text-white/40 rounded-xl hover:text-white/60 transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <Trash2 size={12} /> Clear
            </button>
          </div>
          <div className="text-[10px] text-white/20 text-center">
            {waypoints.length} waypoint{waypoints.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={center}
          zoom={16}
          zoomControl={true}
          attributionControl={false}
          style={{ width: "100%", height: "100%" }}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer name="Street" checked>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
            </LayersControl.BaseLayer>
          </LayersControl>
          <MapClickHandler onMapClick={addWaypoint} />
          {dronePosition && (
            <MapFollower lat={dronePosition.lat} lon={dronePosition.lon} follow={followDrone} />
          )}

          {/* Drone trail */}
          {trail.length >= 2 && (
            <Polyline
              positions={trail}
              color="#22d3ee"
              weight={2}
              opacity={0.4}
            />
          )}

          {/* Drone position */}
          {dronePosition && dronePosition.lat !== 0 && (
            <Marker position={[dronePosition.lat, dronePosition.lon]} icon={droneIcon} />
          )}

          {/* Waypoint markers */}
          {waypoints.map((wp, i) => (
            <Marker
              key={wp.id}
              position={[wp.lat, wp.lon]}
              icon={waypointIcon(i)}
            />
          ))}

          {/* Flight path line */}
          {waypoints.length >= 2 && (
            <Polyline
              positions={waypoints.map((w) => [w.lat, w.lon])}
              color="#06b6d4"
              weight={3}
              dashArray="8 4"
              opacity={0.8}
            />
          )}
        </MapContainer>

        {/* Follow drone toggle */}
        <button
          onClick={() => setFollowDrone((v) => !v)}
          className={`absolute bottom-4 left-4 z-[1000] px-3 py-2 rounded-xl text-xs font-medium backdrop-blur flex items-center gap-1.5 cursor-pointer transition-all ${
            followDrone
              ? "bg-cyan-500/30 text-cyan-300 border border-cyan-500/40"
              : "bg-black/50 text-white/50 border border-white/10 hover:text-white/70"
          }`}
        >
          {followDrone ? <Locate size={14} /> : <LocateOff size={14} />}
          {followDrone ? "Following" : "Follow drone"}
        </button>
      </div>
    </div>
  );
}
