import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { Map, X } from "lucide-react";
import "leaflet/dist/leaflet.css";

interface MiniMapProps {
  lat: number;
  lon: number;
  heading: number;
  gpsFixed: boolean;
}

function droneIcon(heading: number) {
  const deg = (heading * 180) / Math.PI;
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      style="transform:rotate(${deg}deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))">
      <polygon points="12,2 4,20 12,16 20,20" fill="#22d3ee" stroke="#0e7490" stroke-width="1.5"/>
    </svg>`,
  });
}

function MapFollower({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  map.setView([lat, lon], map.getZoom(), { animate: true });
  return null;
}

export default function MiniMap({ lat, lon, heading, gpsFixed }: MiniMapProps) {
  const [visible, setVisible] = useState(true);

  if (!gpsFixed || (lat === 0 && lon === 0)) return null;

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="absolute bottom-14 right-3 z-20 w-8 h-8 rounded-full bg-black/40 backdrop-blur-xl border border-white/[0.08] flex items-center justify-center text-white/60 hover:text-white/90 transition-colors pointer-events-auto"
      >
        <Map size={14} />
      </button>
    );
  }

  return (
    <div className="absolute bottom-14 right-3 z-20 w-[200px] h-[150px] rounded-xl overflow-hidden border border-white/[0.08] bg-black/40 backdrop-blur-xl pointer-events-auto">
      <button
        onClick={() => setVisible(false)}
        className="absolute top-1.5 right-1.5 z-[1000] w-6 h-6 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white/60 hover:text-white/90 transition-colors"
      >
        <X size={12} />
      </button>
      <MapContainer
        center={[lat, lon]}
        zoom={16}
        zoomControl={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[lat, lon]} icon={droneIcon(heading)} />
        <MapFollower lat={lat} lon={lon} />
      </MapContainer>
    </div>
  );
}
