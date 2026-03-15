export interface TelemetryData {
  battery: number;
  flyingState: string;
  gps: { lat: number; lon: number; alt: number };
  gpsSats: number;
  gpsFixed: boolean;
  altitude: number;
  airspeed: number;
  groundspeed: number;
  speedX: number;
  speedY: number;
  speedZ: number;
  attitude: { roll: number; pitch: number; yaw: number };
  cameraTilt: number;
  cameraPan: number;
  voltage: number;
  gyroTemp: number;
  servoLeft: number;
  servoRight: number;
  pitotRaw: number;
  rssi: string;
  rsrp: string;
  rsrq: string;
  sinr: string;
  connected: boolean;
}

export interface GamepadConfig {
  deadzone: number;
  axisRoll: number;
  axisPitch: number;
  axisYaw: number;
  throttleSrc: string; // "rt" or axis index as string
  btnTakeoff: number;
  btnLand: number;
  btnRTH: number;
  btnEmergency: number;
}

export interface PcmdValues {
  flag: number;
  roll: number;
  pitch: number;
  yaw: number;
  gaz: number;
}

export interface GamepadState {
  name: string;
  connected: boolean;
  pcmd: PcmdValues;
  rawAxes: number[];
  buttons: boolean[];
}

export const DEFAULT_CONFIG: GamepadConfig = {
  deadzone: 0.15,
  axisRoll: 0,
  axisPitch: 1,
  axisYaw: 2,
  throttleSrc: "rt",
  btnTakeoff: 0,
  btnLand: 1,
  btnRTH: 3,
  btnEmergency: 9,
};

export const EMPTY_TELEMETRY: TelemetryData = {
  battery: 0,
  flyingState: "disconnected",
  gps: { lat: 0, lon: 0, alt: 0 },
  gpsSats: 0,
  gpsFixed: false,
  altitude: 0,
  airspeed: 0,
  groundspeed: 0,
  speedX: 0,
  speedY: 0,
  speedZ: 0,
  attitude: { roll: 0, pitch: 0, yaw: 0 },
  cameraTilt: 0,
  cameraPan: 0,
  voltage: 0,
  gyroTemp: 0,
  servoLeft: 1500,
  servoRight: 1500,
  pitotRaw: 0,
  rssi: "",
  rsrp: "",
  rsrq: "",
  sinr: "",
  connected: false,
};

export interface Waypoint {
  id: string;
  lat: number;
  lon: number;
  altitude: number;
}

export const DEFAULT_ALTITUDE = 50;

// --- Alert types ---
export type AlertSeverity = "warning" | "critical";

export interface Alert {
  id: string;
  message: string;
  severity: AlertSeverity;
}

export interface AlertConfig {
  batteryWarn: number;
  batteryCritical: number;
  rssiMin: number; // dBm
  altitudeMax: number; // metres
  gpsSatsMin: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  batteryWarn: 30,
  batteryCritical: 15,
  rssiMin: -90,
  altitudeMax: 150,
  gpsSatsMin: 4,
};
