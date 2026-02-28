interface AttitudeIndicatorProps {
  roll: number;
  pitch: number;
}

export default function AttitudeIndicator({
  roll,
  pitch,
}: AttitudeIndicatorProps) {
  // Pitch offset: clamp and scale to SVG units
  const pitchOffset = Math.max(-30, Math.min(30, pitch * 0.8));

  return (
    <div className="flex justify-center my-1">
      <svg
        width="88"
        height="88"
        viewBox="-44 -44 88 88"
        className="rounded-full"
        style={{ filter: "drop-shadow(0 0 12px rgba(6,182,212,0.25))" }}
      >
        <defs>
          <clipPath id="horizon-clip">
            <circle cx="0" cy="0" r="42" />
          </clipPath>
          <linearGradient id="sky-grad" x1="0" y1="-100" x2="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0c4a6e" />
            <stop offset="100%" stopColor="#1e3a5f" />
          </linearGradient>
          <linearGradient id="ground-grad" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#78350f" />
            <stop offset="100%" stopColor="#5c3d1a" />
          </linearGradient>
        </defs>

        <g clipPath="url(#horizon-clip)">
          <g transform={`rotate(${-roll}) translate(0, ${pitchOffset})`}>
            {/* Sky */}
            <rect x="-100" y="-100" width="200" height="100" fill="url(#sky-grad)" />
            {/* Ground */}
            <rect x="-100" y="0" width="200" height="100" fill="url(#ground-grad)" />
            {/* Horizon line */}
            <line
              x1="-100"
              y1="0"
              x2="100"
              y2="0"
              stroke="white"
              strokeWidth="0.5"
              opacity="0.6"
            />
            {/* Pitch ladder lines */}
            {[-20, -10, 10, 20].map((p) => (
              <line
                key={p}
                x1="-12"
                y1={-p * 0.8}
                x2="12"
                y2={-p * 0.8}
                stroke="white"
                strokeWidth="0.4"
                opacity="0.4"
              />
            ))}
          </g>
        </g>

        {/* Fixed aircraft reference */}
        <line x1="-18" y1="0" x2="-6" y2="0" stroke="rgb(6,182,212)" strokeWidth="2" style={{ filter: "drop-shadow(0 0 3px rgba(6,182,212,0.6))" }} />
        <line x1="6" y1="0" x2="18" y2="0" stroke="rgb(6,182,212)" strokeWidth="2" style={{ filter: "drop-shadow(0 0 3px rgba(6,182,212,0.6))" }} />
        <circle cx="0" cy="0" r="2" fill="rgb(6,182,212)" style={{ filter: "drop-shadow(0 0 3px rgba(6,182,212,0.6))" }} />

        {/* Outer ring */}
        <circle
          cx="0"
          cy="0"
          r="42"
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}
