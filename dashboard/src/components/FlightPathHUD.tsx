import type { TelemetryData } from "../lib/types";

interface FlightPathHUDProps {
  telemetry: TelemetryData;
}

export default function FlightPathHUD({ telemetry: t }: FlightPathHUDProps) {
  const roll = t.attitude.roll;
  const pitch = t.attitude.pitch;
  const heading = t.attitude.yaw;

  const pitchScale = 3.5; // px per degree

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <svg
        width="100%"
        height="100%"
        viewBox="-200 -150 400 300"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0"
      >
        {/* Rotate everything by roll, translate by pitch */}
        <g transform={`rotate(${-roll})`}>
          <g transform={`translate(0, ${pitch * pitchScale})`}>
            {/* Horizon line */}
            <line
              x1="-400" y1="0" x2="-40" y2="0"
              stroke="rgba(0,255,128,0.6)" strokeWidth="1.5"
            />
            <line
              x1="40" y1="0" x2="400" y2="0"
              stroke="rgba(0,255,128,0.6)" strokeWidth="1.5"
            />

            {/* Pitch ladder - positive (nose up) */}
            {[5, 10, 15, 20, 30].map((deg) => (
              <g key={`up${deg}`} transform={`translate(0, ${-deg * pitchScale})`}>
                <line x1="-50" y1="0" x2="-15" y2="0" stroke="rgba(0,255,128,0.5)" strokeWidth="1" />
                <line x1="15" y1="0" x2="50" y2="0" stroke="rgba(0,255,128,0.5)" strokeWidth="1" />
                {/* Tick up at ends */}
                <line x1="-50" y1="0" x2="-50" y2="4" stroke="rgba(0,255,128,0.5)" strokeWidth="1" />
                <line x1="50" y1="0" x2="50" y2="4" stroke="rgba(0,255,128,0.5)" strokeWidth="1" />
                <text x="-58" y="3" fill="rgba(0,255,128,0.6)" fontSize="7" textAnchor="end" fontFamily="monospace">{deg}</text>
                <text x="58" y="3" fill="rgba(0,255,128,0.6)" fontSize="7" textAnchor="start" fontFamily="monospace">{deg}</text>
              </g>
            ))}

            {/* Pitch ladder - negative (nose down) - dashed */}
            {[5, 10, 15, 20, 30].map((deg) => (
              <g key={`dn${deg}`} transform={`translate(0, ${deg * pitchScale})`}>
                <line x1="-50" y1="0" x2="-15" y2="0" stroke="rgba(0,255,128,0.4)" strokeWidth="1" strokeDasharray="4 3" />
                <line x1="15" y1="0" x2="50" y2="0" stroke="rgba(0,255,128,0.4)" strokeWidth="1" strokeDasharray="4 3" />
                {/* Tick down at ends */}
                <line x1="-50" y1="0" x2="-50" y2="-4" stroke="rgba(0,255,128,0.4)" strokeWidth="1" />
                <line x1="50" y1="0" x2="50" y2="-4" stroke="rgba(0,255,128,0.4)" strokeWidth="1" />
                <text x="-58" y="3" fill="rgba(0,255,128,0.5)" fontSize="7" textAnchor="end" fontFamily="monospace">-{deg}</text>
                <text x="58" y="3" fill="rgba(0,255,128,0.5)" fontSize="7" textAnchor="start" fontFamily="monospace">-{deg}</text>
              </g>
            ))}
          </g>
        </g>

        {/* Fixed aircraft symbol (boresight) - doesn't rotate */}
        <line x1="-30" y1="0" x2="-10" y2="0" stroke="rgba(0,255,128,0.9)" strokeWidth="2" />
        <line x1="10" y1="0" x2="30" y2="0" stroke="rgba(0,255,128,0.9)" strokeWidth="2" />
        <line x1="-10" y1="0" x2="-10" y2="6" stroke="rgba(0,255,128,0.9)" strokeWidth="2" />
        <line x1="10" y1="0" x2="10" y2="6" stroke="rgba(0,255,128,0.9)" strokeWidth="2" />
        <circle cx="0" cy="0" r="2" fill="none" stroke="rgba(0,255,128,0.9)" strokeWidth="1.5" />

        {/* Bank angle indicator at top */}
        <g transform="translate(0, -110)">
          {/* Arc */}
          {[-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].map((a) => {
            const rad = (a * Math.PI) / 180;
            const r = 90;
            const x = Math.sin(rad) * r;
            const y = -Math.cos(rad) * r;
            const len = a % 30 === 0 ? 10 : a % 10 === 0 ? 7 : 5;
            const x2 = Math.sin(rad) * (r + len);
            const y2 = -Math.cos(rad) * (r + len);
            return (
              <line
                key={`ba${a}`}
                x1={x} y1={y + 110} x2={x2} y2={y2 + 110}
                stroke="rgba(0,255,128,0.4)" strokeWidth="1"
              />
            );
          })}
          {/* Current bank pointer */}
          <g transform={`rotate(${-roll}) translate(0, ${110 - 90})`}>
            <polygon
              points="0,-4 -4,4 4,4"
              fill="rgba(0,255,128,0.8)"
            />
          </g>
        </g>

        {/* Heading tape at bottom */}
        <g transform="translate(0, 125)">
          <rect x="-60" y="-10" width="120" height="20" rx="3" fill="rgba(0,0,0,0.4)" />
          {(() => {
            const ticks = [];
            const hdg = ((heading % 360) + 360) % 360;
            for (let d = -30; d <= 30; d += 5) {
              const val = ((Math.round(hdg) + d) % 360 + 360) % 360;
              const x = d * 1.8;
              const cardinal =
                val === 0 ? "N" : val === 90 ? "E" : val === 180 ? "S" : val === 270 ? "W" : null;
              ticks.push(
                <g key={`ht${d}`}>
                  <line x1={x} y1={-6} x2={x} y2={d % 10 === 0 ? -2 : -4} stroke="rgba(0,255,128,0.5)" strokeWidth="0.8" />
                  {d % 10 === 0 && (
                    <text x={x} y="6" fill="rgba(0,255,128,0.7)" fontSize="7" textAnchor="middle" fontFamily="monospace">
                      {cardinal || val}
                    </text>
                  )}
                </g>
              );
            }
            return ticks;
          })()}
          {/* Center caret */}
          <polygon points="0,-10 -4,-14 4,-14" fill="rgba(0,255,128,0.8)" />
        </g>

        {/* Speed box left */}
        <g transform="translate(-120, 0)">
          <rect x="-35" y="-12" width="35" height="24" rx="3" fill="rgba(0,0,0,0.4)" />
          <text x="-17" y="5" fill="rgba(0,255,128,0.9)" fontSize="10" textAnchor="middle" fontFamily="monospace">
            {t.airspeed}
          </text>
          <text x="-17" y="-16" fill="rgba(0,255,128,0.5)" fontSize="6" textAnchor="middle" fontFamily="monospace">
            KTS
          </text>
        </g>

        {/* Altitude box right */}
        <g transform="translate(120, 0)">
          <rect x="0" y="-12" width="40" height="24" rx="3" fill="rgba(0,0,0,0.4)" />
          <text x="20" y="5" fill="rgba(0,255,128,0.9)" fontSize="10" textAnchor="middle" fontFamily="monospace">
            {t.altitude}
          </text>
          <text x="20" y="-16" fill="rgba(0,255,128,0.5)" fontSize="6" textAnchor="middle" fontFamily="monospace">
            ALT
          </text>
        </g>
      </svg>
    </div>
  );
}
