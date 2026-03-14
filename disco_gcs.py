#!/usr/bin/env python3
"""
Disco Ground Control Station — Python Backend
Connects to Parrot Disco via ARSDK3, proxies video/telemetry/commands to browser.
"""

import asyncio
import json
import logging
import socket
import struct
import subprocess
import sys
import time
from enum import IntEnum
from http import HTTPStatus
from pathlib import Path

try:
    import websockets
    from websockets.asyncio.server import serve as ws_serve
except ImportError:
    print("Install websockets: pip install websockets")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("disco_gcs")

# ── Configuration ──────────────────────────────────────────────────────────────

DISCO_IP = "10.95.46.222"
DISCOVERY_PORT = 44444
D2C_PORT = 43210            # our UDP port to receive data from drone
ARSTREAM2_CLIENT_STREAM = 55004
ARSTREAM2_CLIENT_CONTROL = 55005
PCMD_HZ = 25
WS_PORT = 8765
HTTP_PORT = 8080
CHUCK_TELEMETRY_PORT = 8889  # cockpit_agent.sh port on drone
FFMPEG_CMD = str(Path(__file__).parent / "ffmpeg.exe") if sys.platform == "win32" else "ffmpeg"

# ── ARSDK3 Protocol Constants ─────────────────────────────────────────────────

class DataType(IntEnum):
    ACK = 1
    DATA = 2
    DATA_LOW_LATENCY = 3
    DATA_WITH_ACK = 4

class BufferID(IntEnum):
    PING = 0
    PONG = 1
    C2D_NON_ACK = 10      # PCMD goes here
    C2D_ACK = 11           # commands with ack
    C2D_EMERGENCY = 12
    D2C_NON_ACK = 127
    D2C_ACK = 126
    D2C_ARSTREAM = 125

# ARSDK3 command IDs (project=1 for ardrone3)
ARDRONE3_PROJECT = 1

# Class IDs within ardrone3
class Ardrone3Class(IntEnum):
    PILOTING = 0
    CAMERA = 1
    PILOTING_SETTINGS = 2
    MEDIA_STREAMING = 21
    GPS_SETTINGS = 23
    PILOTING_STATE = 4
    CAMERA_STATE = 5
    SPEED_SETTINGS = 11
    NETWORK_SETTINGS = 9
    SETTINGS_STATE = 16
    COMMON_STATE = 5       # in common project

# Piloting commands
class PilotingCmd(IntEnum):
    FLAT_TRIM = 0
    TAKEOFF = 1
    PCMD = 2
    LANDING = 3
    EMERGENCY = 4
    NAVIGATE_HOME = 5
    AUTO_TAKEOFF = 6
    MOVE_BY = 7

# MediaStreaming commands
class MediaStreamingCmd(IntEnum):
    VIDEO_ENABLE = 0

# Camera commands
class CameraCmd(IntEnum):
    ORIENTATION = 0

# Common project
COMMON_PROJECT = 0

class CommonClass(IntEnum):
    COMMON = 4
    COMMON_STATE = 5
    SETTINGS_STATE = 16
    CALIBRATION = 13
    CALIBRATION_STATE = 14

# ── Frame Packing ─────────────────────────────────────────────────────────────

class ARSDKProtocol:
    """ARSDK3 binary frame encoder/decoder."""

    def __init__(self):
        self.seq_counters = {}  # buffer_id -> sequence number

    def next_seq(self, buffer_id: int) -> int:
        seq = self.seq_counters.get(buffer_id, 0)
        seq = (seq + 1) % 256
        self.seq_counters[buffer_id] = seq
        return seq

    def pack_frame(self, data_type: int, buffer_id: int, payload: bytes) -> bytes:
        """Pack an ARSDK3 frame: header(7 bytes) + payload."""
        seq = self.next_seq(buffer_id)
        size = 7 + len(payload)
        header = struct.pack("<BBBI", data_type, buffer_id, seq, size)
        return header + payload

    def pack_command(self, project: int, cls: int, cmd: int, *args_fmt_vals) -> bytes:
        """Pack an ARSDK3 command payload.
        args_fmt_vals: pairs of (format_char, value), e.g. ('B', 1), ('b', -50)
        """
        # Command header: project(1) + class(1) + command(2) little-endian
        payload = struct.pack("<BBH", project, cls, cmd)
        for fmt, val in args_fmt_vals:
            payload += struct.pack("<" + fmt, val)
        return payload

    def pack_pcmd(self, flag: int, roll: int, pitch: int, yaw: int, gaz: int) -> bytes:
        """Pack a PCMD (pilot command) frame."""
        # Clamp values
        roll = max(-100, min(100, roll))
        pitch = max(-100, min(100, pitch))
        yaw = max(-100, min(100, yaw))
        gaz = max(-100, min(100, gaz))
        cmd_payload = self.pack_command(
            ARDRONE3_PROJECT, Ardrone3Class.PILOTING, PilotingCmd.PCMD,
            ('B', flag), ('b', roll), ('b', pitch), ('b', yaw), ('b', gaz),
            ('I', 0)  # timestampAndSeqNum
        )
        return self.pack_frame(DataType.DATA, BufferID.C2D_NON_ACK, cmd_payload)

    def pack_takeoff(self) -> bytes:
        cmd = self.pack_command(ARDRONE3_PROJECT, Ardrone3Class.PILOTING, PilotingCmd.TAKEOFF)
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, cmd)

    def pack_landing(self) -> bytes:
        cmd = self.pack_command(ARDRONE3_PROJECT, Ardrone3Class.PILOTING, PilotingCmd.LANDING)
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, cmd)

    def pack_emergency(self) -> bytes:
        cmd = self.pack_command(ARDRONE3_PROJECT, Ardrone3Class.PILOTING, PilotingCmd.EMERGENCY)
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_EMERGENCY, cmd)

    def pack_navigate_home(self, start: int) -> bytes:
        cmd = self.pack_command(
            ARDRONE3_PROJECT, Ardrone3Class.PILOTING, PilotingCmd.NAVIGATE_HOME,
            ('B', start)
        )
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, cmd)

    def pack_video_enable(self, enable: int) -> bytes:
        cmd = self.pack_command(
            ARDRONE3_PROJECT, Ardrone3Class.MEDIA_STREAMING, MediaStreamingCmd.VIDEO_ENABLE,
            ('B', enable)
        )
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, cmd)

    def pack_camera_orientation(self, tilt: int, pan: int) -> bytes:
        cmd = self.pack_command(
            ARDRONE3_PROJECT, Ardrone3Class.CAMERA, CameraCmd.ORIENTATION,
            ('b', tilt), ('b', pan)
        )
        return self.pack_frame(DataType.DATA, BufferID.C2D_NON_ACK, cmd)

    def pack_flat_trim(self) -> bytes:
        cmd = self.pack_command(ARDRONE3_PROJECT, Ardrone3Class.PILOTING, PilotingCmd.FLAT_TRIM)
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, cmd)

    def pack_magnetometer_calibration(self, calibrate: int) -> bytes:
        """Start (1) or cancel (0) magnetometer calibration. Common.Calibration.MagnetoCalibration."""
        cmd = self.pack_command(COMMON_PROJECT, CommonClass.CALIBRATION, 0, ('B', calibrate))
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, cmd)

    def pack_mavlink_start(self, filename: str, plan_type: int = 0) -> bytes:
        """Pack common.Mavlink.Start (project=0, cls=11, cmd=0)."""
        payload = struct.pack("<BBH", COMMON_PROJECT, 11, 0)
        payload += filename.encode("utf-8") + b"\x00"
        payload += struct.pack("<I", plan_type)
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, payload)

    def pack_mavlink_pause(self) -> bytes:
        """Pack common.Mavlink.Pause (project=0, cls=11, cmd=1)."""
        payload = struct.pack("<BBH", COMMON_PROJECT, 11, 1)
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, payload)

    def pack_mavlink_stop(self) -> bytes:
        """Pack common.Mavlink.Stop (project=0, cls=11, cmd=2)."""
        payload = struct.pack("<BBH", COMMON_PROJECT, 11, 2)
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, payload)

    def pack_pitot_calibration(self, calibrate: int) -> bytes:
        """Start (1) or cancel (0) pitot calibration. ardrone3.PilotingSettings.PitotCalibration (cls=2, cmd=3)."""
        cmd = self.pack_command(ARDRONE3_PROJECT, Ardrone3Class.PILOTING_SETTINGS, 3, ('B', calibrate))
        return self.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, cmd)

    @staticmethod
    def parse_frame(data: bytes):
        """Parse an incoming ARSDK3 frame. Returns (data_type, buffer_id, seq, payload) or None."""
        if len(data) < 7:
            return None
        data_type, buffer_id, seq, size = struct.unpack("<BBBI", data[:7])
        payload = data[7:size]
        return data_type, buffer_id, seq, payload

    @staticmethod
    def parse_command(payload: bytes):
        """Parse command header from payload. Returns (project, cls, cmd, args_data)."""
        if len(payload) < 4:
            return None
        project, cls, cmd = struct.unpack("<BBH", payload[:4])
        return project, cls, cmd, payload[4:]


# ── Telemetry State ───────────────────────────────────────────────────────────

class TelemetryState:
    """Stores latest telemetry values from drone."""

    def __init__(self):
        self.battery_percent = 0
        self.flying_state = "disconnected"
        self.gps_lat = 0.0
        self.gps_lon = 0.0
        self.gps_alt = 0.0
        self.gps_sats = 0
        self.gps_fixed = False
        self.altitude = 0.0
        self.speed_x = 0.0
        self.speed_y = 0.0
        self.speed_z = 0.0
        self.air_speed = 0.0
        self.attitude_roll = 0.0
        self.attitude_pitch = 0.0
        self.attitude_yaw = 0.0
        self.camera_tilt = 0
        self.camera_pan = 0
        # Extra from cockpit_agent
        self.voltage = 0.0
        self.gyro_temp = 0.0
        self.servo_left = 1500
        self.servo_right = 1500
        self.pitot_raw = 0
        self.rssi = ""
        self.rsrp = ""
        self.rsrq = ""
        self.sinr = ""
        self.connected = False
        self.last_update = 0

    FLYING_STATES = {
        0: "landed", 1: "takingoff", 2: "hovering", 3: "flying",
        4: "landing", 5: "emergency", 6: "usertakeoff", 7: "motor_ramping",
        8: "emergency_landing"
    }

    def to_dict(self) -> dict:
        groundspeed = (self.speed_x**2 + self.speed_y**2) ** 0.5
        return {
            "battery": self.battery_percent,
            "flyingState": self.flying_state,
            "gps": {"lat": self.gps_lat, "lon": self.gps_lon, "alt": self.gps_alt},
            "gpsSats": self.gps_sats,
            "gpsFixed": self.gps_fixed,
            "altitude": round(self.altitude, 1),
            "airspeed": round(self.air_speed, 1),
            "groundspeed": round(groundspeed, 1),
            "speedX": round(self.speed_x, 2),
            "speedY": round(self.speed_y, 2),
            "speedZ": round(self.speed_z, 2),
            "attitude": {
                "roll": round(self.attitude_roll, 2),
                "pitch": round(self.attitude_pitch, 2),
                "yaw": round(self.attitude_yaw, 2),
            },
            "cameraTilt": self.camera_tilt,
            "cameraPan": self.camera_pan,
            "voltage": round(self.voltage, 2),
            "gyroTemp": round(self.gyro_temp, 1),
            "servoLeft": self.servo_left,
            "servoRight": self.servo_right,
            "pitotRaw": self.pitot_raw,
            "rssi": self.rssi,
            "rsrp": self.rsrp,
            "rsrq": self.rsrq,
            "sinr": self.sinr,
            "connected": self.connected,
        }


# ── Disco Connection ──────────────────────────────────────────────────────────

class DiscoConnection:
    """Manages ARSDK3 connection to the Parrot Disco."""

    def __init__(self):
        self.protocol = ARSDKProtocol()
        self.telemetry = TelemetryState()
        self.c2d_port = None       # UDP port drone listens on (from discovery)
        self.cmd_sock = None       # UDP socket for sending commands
        self.recv_sock = None      # UDP socket for receiving data
        self.connected = False
        self.pcmd_flag = 0
        self.pcmd_roll = 0
        self.pcmd_pitch = 0
        self.pcmd_yaw = 0
        self.pcmd_gaz = 0
        # Test mode
        self._test_mode = False
        self._test_sock = None
        self._test_motor_enabled = False
        self.ws_clients = set()
        self.video_clients = set()
        self.ffmpeg_proc = None
        self.log_messages = []
        self._bg_tasks = []

    def add_log(self, msg: str):
        self.log_messages.append(msg)
        if len(self.log_messages) > 100:
            self.log_messages.pop(0)
        log.info(msg)

    async def discover(self) -> bool:
        """TCP discovery handshake on port 44444."""
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(DISCO_IP, DISCOVERY_PORT),
                timeout=5.0
            )
            discovery_msg = json.dumps({
                "d2c_port": D2C_PORT,
                "controller_type": "computer",
                "controller_name": "DiscoCockpit",
                "arstream2_client_stream_port": ARSTREAM2_CLIENT_STREAM,
                "arstream2_client_control_port": ARSTREAM2_CLIENT_CONTROL,
            })
            writer.write(discovery_msg.encode() + b'\0')
            await writer.drain()

            response = await asyncio.wait_for(reader.read(4096), timeout=5.0)
            response_str = response.decode().strip('\0')
            resp_data = json.loads(response_str)
            self.c2d_port = resp_data.get("c2d_port")
            self.add_log(f"Discovery OK — c2d_port={self.c2d_port}")

            writer.close()
            await writer.wait_closed()
            return True
        except (ConnectionRefusedError, OSError, asyncio.TimeoutError) as e:
            self.add_log(f"Discovery failed: {e}")
            return False
        except json.JSONDecodeError as e:
            self.add_log(f"Discovery bad response: {e}")
            return False

    async def connect(self) -> bool:
        """Full connection: discovery + UDP sockets + enable video."""
        if self.connected:
            return True
        if not await self.discover():
            return False

        # Create UDP socket for receiving drone data
        self.recv_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.recv_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.recv_sock.bind(("0.0.0.0", D2C_PORT))
        self.recv_sock.setblocking(False)

        # Create UDP socket for sending commands
        self.cmd_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.cmd_sock.setblocking(False)

        self.connected = True
        self.telemetry.connected = True
        self.telemetry.flying_state = "landed"
        self.add_log("Connected to Disco")

        # Send date/time, flat trim, enable video
        await self.send_allstates()
        await self.send_flat_trim()
        await asyncio.sleep(0.2)
        await self.send_video_enable(True)

        return True

    def send_cmd(self, frame: bytes):
        """Send a raw ARSDK3 frame to the drone."""
        if self.cmd_sock and self.c2d_port:
            try:
                self.cmd_sock.sendto(frame, (DISCO_IP, self.c2d_port))
            except OSError as e:
                log.warning(f"Send error: {e}")

    async def send_allstates(self):
        """Request all states from drone (common.Common.AllStates)."""
        cmd = self.protocol.pack_command(COMMON_PROJECT, 4, 0)
        frame = self.protocol.pack_frame(DataType.DATA_WITH_ACK, BufferID.C2D_ACK, cmd)
        self.send_cmd(frame)

    async def send_flat_trim(self):
        self.send_cmd(self.protocol.pack_flat_trim())
        self.add_log("FLAT TRIM sent — calibrating level reference")

    async def send_magneto_calibration(self, start: bool):
        self.send_cmd(self.protocol.pack_magnetometer_calibration(1 if start else 0))
        self.add_log(f"Magnetometer calibration {'STARTED — rotate drone on all axes' if start else 'CANCELLED'}")

    async def send_pitot_calibration(self, start: bool):
        self.send_cmd(self.protocol.pack_pitot_calibration(1 if start else 0))
        self.add_log(f"Pitot calibration {'STARTED — keep drone still, no wind' if start else 'CANCELLED'}")

    # ── Flight Plans ─────────────────────────────────────────────────────────

    async def upload_flightplan(self, filename: str, content: str) -> bool:
        """Upload a Mavlink flight plan file to the drone via FTP."""
        try:
            ftp = __import__('ftplib').FTP()
            ftp.connect(DISCO_IP, 21, timeout=5)
            ftp.login()
            try:
                ftp.cwd("/internal_000/flightplans")
            except Exception:
                ftp.mkd("/internal_000/flightplans")
                ftp.cwd("/internal_000/flightplans")
            from io import BytesIO
            ftp.storbinary(f"STOR {filename}", BytesIO(content.encode("utf-8")))
            ftp.quit()
            self.add_log(f"Flight plan '{filename}' uploaded")
            return True
        except Exception as e:
            self.add_log(f"FTP upload failed: {e}")
            return False

    async def send_mavlink_start(self, filename: str):
        remote_path = f"flightplans/{filename}"
        self.send_cmd(self.protocol.pack_mavlink_start(remote_path))
        self.add_log(f"MAVLINK START — {filename}")

    async def send_mavlink_pause(self):
        self.send_cmd(self.protocol.pack_mavlink_pause())
        self.add_log("MAVLINK PAUSE")

    async def send_mavlink_stop(self):
        self.send_cmd(self.protocol.pack_mavlink_stop())
        self.add_log("MAVLINK STOP")

    async def send_video_enable(self, enable: bool):
        self.send_cmd(self.protocol.pack_video_enable(1 if enable else 0))
        self.add_log(f"Video {'enabled' if enable else 'disabled'}")

    async def send_takeoff(self):
        self.send_cmd(self.protocol.pack_takeoff())
        self.add_log("TAKEOFF command sent")

    async def send_landing(self):
        self.send_cmd(self.protocol.pack_landing())
        self.add_log("LAND command sent")

    async def send_emergency(self):
        self.send_cmd(self.protocol.pack_emergency())
        self.add_log("EMERGENCY command sent")

    async def send_navigate_home(self, start: bool):
        self.send_cmd(self.protocol.pack_navigate_home(1 if start else 0))
        self.add_log(f"RTH {'start' if start else 'stop'} command sent")

    async def send_camera_orientation(self, tilt: int, pan: int):
        self.send_cmd(self.protocol.pack_camera_orientation(tilt, pan))

    def update_pcmd(self, flag: int, roll: int, pitch: int, yaw: int, gaz: int):
        """Update PCMD values (called from WebSocket handler)."""
        self.pcmd_flag = flag
        self.pcmd_roll = roll
        self.pcmd_pitch = pitch
        self.pcmd_yaw = yaw
        self.pcmd_gaz = gaz

    async def pcmd_loop(self):
        """Send PCMD at 25Hz."""
        interval = 1.0 / PCMD_HZ
        while self.connected:
            frame = self.protocol.pack_pcmd(
                self.pcmd_flag, self.pcmd_roll, self.pcmd_pitch,
                self.pcmd_yaw, self.pcmd_gaz
            )
            self.send_cmd(frame)
            await asyncio.sleep(interval)

    async def recv_loop(self):
        """Receive and parse telemetry from drone."""
        loop = asyncio.get_event_loop()
        while self.connected:
            try:
                data = await asyncio.wait_for(
                    loop.sock_recv(self.recv_sock, 65536),
                    timeout=2.0
                )
                self.process_incoming(data)
            except asyncio.TimeoutError:
                pass
            except OSError as e:
                log.warning(f"Recv error: {e}")
                await asyncio.sleep(0.1)

    def process_incoming(self, data: bytes):
        """Process incoming ARSDK3 frames."""
        offset = 0
        while offset < len(data):
            if offset + 7 > len(data):
                break
            data_type, buffer_id, seq, size = struct.unpack("<BBBI", data[offset:offset+7])
            if offset + size > len(data):
                break
            payload = data[offset+7:offset+size]
            self.handle_frame(data_type, buffer_id, seq, payload)

            # Send ACK for DATA_WITH_ACK frames
            if data_type == DataType.DATA_WITH_ACK:
                self.send_ack(buffer_id, seq)

            offset += size

    def send_ack(self, buffer_id: int, seq: int):
        """Send ACK for a received DATA_WITH_ACK frame."""
        # ACK buffer = received buffer + 128 (wrapping)
        ack_buffer = (buffer_id + 128) % 256
        ack_payload = struct.pack("<B", seq)
        frame = self.protocol.pack_frame(DataType.ACK, ack_buffer, ack_payload)
        self.send_cmd(frame)

    def handle_frame(self, data_type: int, buffer_id: int, seq: int, payload: bytes):
        """Dispatch incoming frame based on command IDs."""
        parsed = ARSDKProtocol.parse_command(payload)
        if not parsed:
            return
        project, cls, cmd, args = parsed
        self.telemetry.last_update = time.time()

        if project == ARDRONE3_PROJECT:
            self.handle_ardrone3(cls, cmd, args)
        elif project == COMMON_PROJECT:
            self.handle_common(cls, cmd, args)

    def handle_ardrone3(self, cls: int, cmd: int, args: bytes):
        """Handle ardrone3 project telemetry."""
        # PilotingState
        if cls == 4:
            # FlyingStateChanged (cmd=1)
            if cmd == 1 and len(args) >= 4:
                state_val = struct.unpack("<I", args[:4])[0]
                self.telemetry.flying_state = TelemetryState.FLYING_STATES.get(state_val, f"unknown({state_val})")
                self.add_log(f"Flying state: {self.telemetry.flying_state}")

            # PositionChanged (cmd=4): lat(d), lon(d), alt(d)
            elif cmd == 4 and len(args) >= 24:
                lat, lon, alt = struct.unpack("<ddd", args[:24])
                if lat != 500.0:  # 500.0 means invalid
                    self.telemetry.gps_lat = lat
                    self.telemetry.gps_lon = lon
                    self.telemetry.gps_alt = alt
                    # Disco firmware doesn't always report sat count,
                    # but if we're getting valid position, we have a fix
                    if not self.telemetry.gps_fixed:
                        self.telemetry.gps_fixed = True

            # SpeedChanged (cmd=5): speedX(f), speedY(f), speedZ(f)
            elif cmd == 5 and len(args) >= 12:
                sx, sy, sz = struct.unpack("<fff", args[:12])
                self.telemetry.speed_x = sx
                self.telemetry.speed_y = sy
                self.telemetry.speed_z = sz

            # AttitudeChanged (cmd=6): roll(f), pitch(f), yaw(f)
            elif cmd == 6 and len(args) >= 12:
                import math
                r, p, y = struct.unpack("<fff", args[:12])
                self.telemetry.attitude_roll = math.degrees(r)
                self.telemetry.attitude_pitch = math.degrees(p)
                self.telemetry.attitude_yaw = math.degrees(y)

            # AltitudeChanged (cmd=8): altitude(d)
            elif cmd == 8 and len(args) >= 8:
                alt, = struct.unpack("<d", args[:8])
                self.telemetry.altitude = alt

            # AirSpeedChanged (cmd=12): airSpeed(f)
            elif cmd == 12 and len(args) >= 4:
                speed, = struct.unpack("<f", args[:4])
                self.telemetry.air_speed = speed

        # GPSState (cls=24)
        elif cls == 24:
            # GpsFixStateChanged (cmd=2): fixed(u8) 0=unfixed 1=fixed
            if cmd == 2 and len(args) >= 1:
                self.telemetry.gps_fixed = args[0] == 1

        # GPSSettingsState (cls=31)
        elif cls == 31:
            # GPSFixStateChanged (cmd=0): fixed(u8)
            if cmd == 0 and len(args) >= 1:
                self.telemetry.gps_fixed = args[0] == 1
            # NumberOfSatelliteChanged (cmd=2)
            elif cmd == 2 and len(args) >= 4:
                sats = struct.unpack("<I", args[:4])[0]
                self.telemetry.gps_sats = sats

        # CameraState (cls=25): Orientation (cmd=0)
        elif cls == 25:
            if cmd == 0 and len(args) >= 2:
                tilt, pan = struct.unpack("<bb", args[:2])
                self.telemetry.camera_tilt = tilt
                self.telemetry.camera_pan = pan

    def handle_common(self, cls: int, cmd: int, args: bytes):
        """Handle common project telemetry."""
        # CommonState (cls=5)
        if cls == 5:
            # BatteryStateChanged (cmd=1): percent(u8)
            if cmd == 1 and len(args) >= 1:
                self.telemetry.battery_percent = args[0]
            # SensorsStatesListChanged (cmd=8)
            # WifiSignalChanged (cmd=7)

        # CalibrationState (cls=14)
        elif cls == 14:
            # MagnetoCalibrationStateChanged (cmd=0): xAxisCalibration(u8), yAxis(u8), zAxis(u8), calibrationFailed(u8)
            if cmd == 0 and len(args) >= 4:
                x, y, z, failed = args[0], args[1], args[2], args[3]
                if failed:
                    self.add_log("Magnetometer calibration FAILED")
                else:
                    axes = []
                    if x: axes.append("X")
                    if y: axes.append("Y")
                    if z: axes.append("Z")
                    done = "+".join(axes) if axes else "none"
                    if x and y and z:
                        self.add_log("Magnetometer calibration COMPLETE")
                    else:
                        self.add_log(f"Magneto calibration progress: {done} done")
            # MagnetoCalibrationRequiredState (cmd=1)
            elif cmd == 1 and len(args) >= 1:
                if args[0]:
                    self.add_log("Magnetometer calibration required")

    async def telemetry_broadcast_loop(self):
        """Broadcast telemetry to all WebSocket clients at 10Hz."""
        while self.connected:
            if self.ws_clients:
                msg = json.dumps({"type": "telemetry", "data": self.telemetry.to_dict()})
                dead = set()
                for ws in self.ws_clients:
                    try:
                        await ws.send(msg)
                    except websockets.exceptions.ConnectionClosed:
                        dead.add(ws)
                self.ws_clients -= dead
            await asyncio.sleep(0.1)

    # ── Video Proxy ───────────────────────────────────────────────────────────

    async def start_video_proxy(self):
        """Receive RTP on the advertised port, forward to a local port for ffmpeg."""
        FFMPEG_RTP_PORT = 55104  # local port ffmpeg listens on

        # Bind the port we told the drone about during discovery
        self._rtp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._rtp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._rtp_sock.bind(("0.0.0.0", ARSTREAM2_CLIENT_STREAM))
        self._rtp_sock.setblocking(False)
        self.add_log(f"RTP listener bound on UDP :{ARSTREAM2_CLIENT_STREAM}")

        # Forward socket to send complete RTP packets to ffmpeg's local port
        self._rtp_fwd_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._rtp_fwd_sock.setblocking(False)

        # SDP pointing ffmpeg at our local forwarding port
        sdp_content = (
            "v=0\r\n"
            "o=- 0 0 IN IP4 127.0.0.1\r\n"
            "s=Disco\r\n"
            "c=IN IP4 127.0.0.1\r\n"
            f"m=video {FFMPEG_RTP_PORT} RTP/AVP 96\r\n"
            "a=rtpmap:96 H264/90000\r\n"
        )
        sdp_path = Path(__file__).parent / "disco_stream.sdp"
        sdp_path.write_text(sdp_content)

        cmd = [
            FFMPEG_CMD,
            "-protocol_whitelist", "file,udp,rtp",
            "-probesize", "32768",
            "-analyzeduration", "500000",
            "-i", str(sdp_path),
            "-f", "mjpeg",
            "-q:v", "5",
            "-r", "20",
            "-an",
            "pipe:1"
        ]

        try:
            self.ffmpeg_proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            self.add_log("ffmpeg video proxy started")
            self._ffmpeg_rtp_port = FFMPEG_RTP_PORT
            asyncio.create_task(self._ffmpeg_stderr_loop())
            asyncio.create_task(self._rtp_forward_loop())
            await self.video_read_loop()
        except FileNotFoundError:
            self.add_log("ffmpeg not found — video disabled")
        except Exception as e:
            self.add_log(f"ffmpeg error: {e}")

    async def _rtp_forward_loop(self):
        """Receive RTP packets from drone and forward them intact to ffmpeg's local UDP port."""
        loop = asyncio.get_event_loop()
        pkt_count = 0
        while self.ffmpeg_proc and self.ffmpeg_proc.returncode is None:
            try:
                data = await asyncio.wait_for(
                    loop.sock_recv(self._rtp_sock, 65536),
                    timeout=5.0
                )
                if len(data) > 12:
                    # Forward the complete RTP packet to ffmpeg
                    self._rtp_fwd_sock.sendto(data, ("127.0.0.1", self._ffmpeg_rtp_port))
                    pkt_count += 1
                    if pkt_count == 1:
                        self.add_log("Receiving video RTP data from drone")
                    if pkt_count == 100:
                        self.add_log(f"Video: forwarded {pkt_count} RTP packets to ffmpeg")
            except asyncio.TimeoutError:
                continue
            except OSError as e:
                self.add_log(f"RTP forward error: {e}")
                break

    async def _ffmpeg_stderr_loop(self):
        """Read ffmpeg stderr and log it."""
        while self.ffmpeg_proc and self.ffmpeg_proc.returncode is None:
            try:
                line = await asyncio.wait_for(
                    self.ffmpeg_proc.stderr.readline(), timeout=5.0
                )
                if not line:
                    break
                text = line.decode(errors="replace").strip()
                if text:
                    log.info(f"ffmpeg: {text}")
            except asyncio.TimeoutError:
                continue
            except Exception:
                break

    async def video_read_loop(self):
        """Read MJPEG frames from ffmpeg stdout, broadcast to WebSocket clients."""
        JPEG_START = b'\xff\xd8'
        JPEG_END = b'\xff\xd9'
        buf = bytearray()

        while self.ffmpeg_proc and self.ffmpeg_proc.returncode is None:
            try:
                chunk = await asyncio.wait_for(
                    self.ffmpeg_proc.stdout.read(32768),
                    timeout=5.0
                )
            except asyncio.TimeoutError:
                continue
            if not chunk:
                break
            buf.extend(chunk)

            # Extract complete JPEG frames
            while True:
                start = buf.find(JPEG_START)
                if start == -1:
                    buf.clear()
                    break
                end = buf.find(JPEG_END, start + 2)
                if end == -1:
                    # Trim garbage before start marker
                    if start > 0:
                        del buf[:start]
                    break
                frame = bytes(buf[start:end+2])
                del buf[:end+2]

                # Broadcast frame
                if self.video_clients:
                    dead = set()
                    for ws in self.video_clients:
                        try:
                            await ws.send(frame)
                        except websockets.exceptions.ConnectionClosed:
                            dead.add(ws)
                    self.video_clients -= dead

    async def stop_video(self):
        if self.ffmpeg_proc and self.ffmpeg_proc.returncode is None:
            self.ffmpeg_proc.terminate()
            try:
                await asyncio.wait_for(self.ffmpeg_proc.wait(), timeout=3.0)
            except asyncio.TimeoutError:
                self.ffmpeg_proc.kill()
        if hasattr(self, '_rtp_sock') and self._rtp_sock:
            self._rtp_sock.close()
        if hasattr(self, '_rtp_fwd_sock') and self._rtp_fwd_sock:
            self._rtp_fwd_sock.close()

    # ── CHUCK Extra Telemetry ─────────────────────────────────────────────────

    async def chuck_telemetry_loop(self):
        """Poll cockpit_agent.sh on the Disco for extra telemetry."""
        while self.connected:
            try:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(DISCO_IP, CHUCK_TELEMETRY_PORT),
                    timeout=2.0
                )
                data = await asyncio.wait_for(reader.read(4096), timeout=2.0)
                writer.close()
                await writer.wait_closed()

                text = data.decode().strip()
                for line in text.split('\n'):
                    if '=' in line:
                        key, val = line.split('=', 1)
                        key = key.strip()
                        val = val.strip()
                        if key == "voltage":
                            self.telemetry.voltage = float(val)
                        elif key == "gyro_temp":
                            self.telemetry.gyro_temp = float(val)
                        elif key == "servo_left":
                            raw = int(val)
                            self.telemetry.servo_left = raw // 1000 if raw > 10000 else raw
                        elif key == "servo_right":
                            raw = int(val)
                            self.telemetry.servo_right = raw // 1000 if raw > 10000 else raw
                        elif key == "pitot_raw":
                            self.telemetry.pitot_raw = int(val) if val else 0
                        elif key == "rssi":
                            self.telemetry.rssi = val
                        elif key == "rsrp":
                            self.telemetry.rsrp = val
                        elif key == "rsrq":
                            self.telemetry.rsrq = val
                        elif key == "sinr":
                            self.telemetry.sinr = val
                        elif key == "gps_sats":
                            sats = int(val) if val else 0
                            if sats > 0:
                                self.telemetry.gps_sats = sats
            except (OSError, asyncio.TimeoutError, ValueError):
                pass
            await asyncio.sleep(0.5)

    # ── Test Mode (Direct PWM via pwm_agent) ───────────────────────────────

    PWM_AGENT_PORT = 8890
    SERVO_MIN = 1000000   # 1000µs in ns
    SERVO_MAX = 2000000   # 2000µs in ns
    SERVO_NEUTRAL = 1500000
    MOTOR_MAX_TEST = 18750  # ~15% of 125000ns period — safe bench test cap

    async def _pwm_send(self, cmd: str):
        """Send a command to the PWM agent on the drone."""
        if not self._test_sock:
            return
        try:
            self._test_sock.sendall((cmd + '\n').encode())
        except OSError as e:
            self.add_log(f"PWM agent error: {e}")

    async def test_mode_enable(self):
        """Connect to PWM agent and enable servos."""
        if self._test_mode:
            return
        try:
            self._test_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._test_sock.settimeout(3)
            self._test_sock.connect((DISCO_IP, self.PWM_AGENT_PORT))
            self._test_sock.setblocking(False)
            await self._pwm_send('E')  # enable servos
            self._test_mode = True
            self._test_motor_enabled = False
            self.add_log("TEST MODE ENABLED — servos active, motor off")
        except (OSError, socket.timeout) as e:
            self.add_log(f"Test mode failed (is pwm_agent running?): {e}")
            if self._test_sock:
                self._test_sock.close()
                self._test_sock = None

    async def test_mode_disable(self):
        """Disable all PWM and disconnect."""
        if not self._test_mode:
            return
        await self._pwm_send('D')  # disable — sets safe values
        self._test_mode = False
        self._test_motor_enabled = False
        if self._test_sock:
            self._test_sock.close()
            self._test_sock = None
        self.add_log("TEST MODE DISABLED — all PWM safe")

    async def test_mode_set_servos(self, left_pct: int, right_pct: int):
        """Set servo positions. Input: -100 to +100 percent."""
        if not self._test_mode:
            return
        left_pct = max(-100, min(100, left_pct))
        right_pct = max(-100, min(100, right_pct))
        left_ns = self.SERVO_NEUTRAL + int((left_pct / 100) * 500000)
        right_ns = self.SERVO_NEUTRAL + int((right_pct / 100) * 500000)
        left_ns = max(self.SERVO_MIN, min(self.SERVO_MAX, left_ns))
        right_ns = max(self.SERVO_MIN, min(self.SERVO_MAX, right_ns))
        await self._pwm_send(f'S {left_ns} {right_ns}')

    async def test_mode_set_motor(self, throttle_pct: int):
        """Set motor throttle. Input: 0 to 100, capped at MOTOR_MAX_TEST."""
        if not self._test_mode or not self._test_motor_enabled:
            return
        throttle_pct = max(0, min(100, throttle_pct))
        duty_ns = int((throttle_pct / 100) * self.MOTOR_MAX_TEST)
        await self._pwm_send(f'M {duty_ns}')

    async def test_mode_enable_motor(self, enable: bool):
        """Enable/disable motor in test mode."""
        if not self._test_mode:
            return
        self._test_motor_enabled = enable
        if not enable:
            await self._pwm_send('M 0')
        self.add_log(f"Test motor {'ENABLED (15% max)' if enable else 'DISABLED'}")

    # ── Disconnect ────────────────────────────────────────────────────────────

    async def disconnect(self):
        if self._test_mode:
            await self.test_mode_disable()
        self.connected = False
        self.telemetry.connected = False
        self.telemetry.flying_state = "disconnected"
        # Cancel background loops
        for task in self._bg_tasks:
            task.cancel()
        self._bg_tasks.clear()
        await self.stop_video()
        if self.cmd_sock:
            self.cmd_sock.close()
            self.cmd_sock = None
        if self.recv_sock:
            self.recv_sock.close()
            self.recv_sock = None
        self.add_log("Disconnected from Disco")


# ── WebSocket Handler ─────────────────────────────────────────────────────────

async def ws_handler(websocket, disco: DiscoConnection):
    """Handle WebSocket connections from the browser dashboard."""
    path = websocket.request.path if hasattr(websocket, 'request') and websocket.request else "/"

    if path == "/video":
        disco.video_clients.add(websocket)
        log.info("Video client connected")
        try:
            async for _ in websocket:
                pass  # Keep alive
        finally:
            disco.video_clients.discard(websocket)
            log.info("Video client disconnected")
        return

    # Default: control + telemetry channel
    disco.ws_clients.add(websocket)
    log.info("Control client connected")

    # Send initial state (including connection status so reconnecting browsers pick it up)
    try:
        await websocket.send(json.dumps({
            "type": "connectionStatus",
            "connected": disco.connected
        }))
        await websocket.send(json.dumps({
            "type": "telemetry",
            "data": disco.telemetry.to_dict()
        }))
        await websocket.send(json.dumps({
            "type": "log",
            "messages": disco.log_messages[-20:]
        }))
    except websockets.exceptions.ConnectionClosed:
        disco.ws_clients.discard(websocket)
        return

    try:
        async for message in websocket:
            try:
                msg = json.loads(message)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "pcmd":
                disco.update_pcmd(
                    msg.get("flag", 0),
                    msg.get("roll", 0),
                    msg.get("pitch", 0),
                    msg.get("yaw", 0),
                    msg.get("gaz", 0),
                )

            elif msg_type == "takeoff":
                await disco.send_takeoff()

            elif msg_type == "land":
                await disco.send_landing()

            elif msg_type == "emergency":
                await disco.send_emergency()

            elif msg_type == "rth":
                await disco.send_navigate_home(msg.get("start", True))

            elif msg_type == "camera":
                await disco.send_camera_orientation(
                    msg.get("tilt", 0),
                    msg.get("pan", 0),
                )

            elif msg_type == "connect":
                if disco.connected:
                    # Already connected — just tell the client
                    await websocket.send(json.dumps({
                        "type": "connectionStatus",
                        "connected": True
                    }))
                else:
                    ok = await disco.connect()
                    if ok:
                        # Start background loops
                        disco._bg_tasks = [
                            asyncio.create_task(disco.pcmd_loop()),
                            asyncio.create_task(disco.recv_loop()),
                            asyncio.create_task(disco.telemetry_broadcast_loop()),
                            asyncio.create_task(disco.start_video_proxy()),
                            asyncio.create_task(disco.chuck_telemetry_loop()),
                        ]
                    await websocket.send(json.dumps({
                        "type": "connectionStatus",
                        "connected": ok
                    }))

            elif msg_type == "flightplan_upload":
                filename = msg.get("filename", "plan.mavlink")
                content = msg.get("content", "")
                ok = await disco.upload_flightplan(filename, content)
                await websocket.send(json.dumps({
                    "type": "flightplan_status",
                    "action": "upload",
                    "success": ok,
                    "filename": filename,
                }))

            elif msg_type == "mavlink_start":
                await disco.send_mavlink_start(msg.get("filename", "plan.mavlink"))

            elif msg_type == "mavlink_pause":
                await disco.send_mavlink_pause()

            elif msg_type == "mavlink_stop":
                await disco.send_mavlink_stop()

            elif msg_type == "video_enable":
                await disco.send_video_enable(msg.get("enable", True))

            elif msg_type == "flat_trim":
                await disco.send_flat_trim()

            elif msg_type == "magneto_cal":
                await disco.send_magneto_calibration(msg.get("start", True))

            elif msg_type == "pitot_cal":
                await disco.send_pitot_calibration(msg.get("start", True))

            elif msg_type == "test_mode":
                enable = msg.get("enable", False)
                if enable:
                    await disco.test_mode_enable()
                else:
                    await disco.test_mode_disable()
                await websocket.send(json.dumps({
                    "type": "testModeStatus",
                    "enabled": disco._test_mode,
                    "motorEnabled": disco._test_motor_enabled,
                }))

            elif msg_type == "test_pwm":
                await disco.test_mode_set_servos(
                    msg.get("left", 0),
                    msg.get("right", 0),
                )
                throttle = msg.get("throttle", -1)
                if throttle >= 0:
                    await disco.test_mode_set_motor(throttle)

            elif msg_type == "test_servo":
                await disco.test_mode_set_servos(
                    msg.get("left", 0),
                    msg.get("right", 0),
                )

            elif msg_type == "test_motor":
                await disco.test_mode_set_motor(msg.get("throttle", 0))

            elif msg_type == "test_motor_enable":
                await disco.test_mode_enable_motor(msg.get("enable", False))
                await websocket.send(json.dumps({
                    "type": "testModeStatus",
                    "enabled": disco._test_mode,
                    "motorEnabled": disco._test_motor_enabled,
                }))

            elif msg_type == "disconnect":
                await disco.disconnect()
                await websocket.send(json.dumps({
                    "type": "connectionStatus",
                    "connected": False
                }))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        disco.ws_clients.discard(websocket)
        log.info("Control client disconnected")


# ── HTTP Server ───────────────────────────────────────────────────────────────

class SimpleHTTPHandler:
    """Minimal HTTP server to serve the React dashboard build."""

    MIME_TYPES = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
    }

    def __init__(self):
        # Serve from React build output if available, fallback to standalone HTML
        self.dist_dir = Path(__file__).parent / "dashboard" / "dist"
        self.fallback_html = Path(__file__).parent / "disco_cockpit.html"

    async def handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            request_line = await asyncio.wait_for(reader.readline(), timeout=5.0)
            while True:
                line = await reader.readline()
                if line in (b'\r\n', b'\n', b''):
                    break

            request_str = request_line.decode()
            parts = request_str.split()
            path = parts[1] if len(parts) > 1 else "/"

            # Serve React build
            if self.dist_dir.exists():
                if path == "/":
                    path = "/index.html"
                # Sanitize path
                safe_path = path.lstrip("/").replace("..", "")
                file_path = self.dist_dir / safe_path
                if file_path.exists() and file_path.is_file():
                    ext = file_path.suffix
                    content_type = self.MIME_TYPES.get(ext, "application/octet-stream")
                    await self.serve_file(writer, file_path, content_type)
                else:
                    # SPA fallback — serve index.html for any unknown route
                    await self.serve_file(writer, self.dist_dir / "index.html", "text/html")
            else:
                # Fallback to standalone HTML
                await self.serve_file(writer, self.fallback_html, "text/html")

        except Exception as e:
            log.warning(f"HTTP error: {e}")
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    async def serve_file(self, writer, file_path: Path, content_type: str):
        try:
            content = file_path.read_bytes()
            await self.send_response(writer, 200, content_type, content)
        except FileNotFoundError:
            await self.send_response(writer, 404, "text/plain", b"File not found")

    async def send_response(self, writer, status: int, content_type: str, body: bytes):
        reason = "OK" if status == 200 else "Not Found"
        header = (
            f"HTTP/1.1 {status} {reason}\r\n"
            f"Content-Type: {content_type}; charset=utf-8\r\n"
            f"Content-Length: {len(body)}\r\n"
            f"Access-Control-Allow-Origin: *\r\n"
            f"Connection: close\r\n"
            f"\r\n"
        )
        writer.write(header.encode() + body)
        await writer.drain()


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    disco = DiscoConnection()
    http_handler = SimpleHTTPHandler()

    # Start HTTP server
    http_server = await asyncio.start_server(
        http_handler.handle, "0.0.0.0", HTTP_PORT
    )
    log.info(f"HTTP server on http://localhost:{HTTP_PORT}")

    # Start WebSocket server
    ws_server = await ws_serve(
        lambda ws: ws_handler(ws, disco),
        "0.0.0.0", WS_PORT
    )
    log.info(f"WebSocket server on ws://localhost:{WS_PORT}")

    log.info("Disco GCS ready — open browser to connect")
    log.info(f"Waiting for browser to initiate connection to Disco at {DISCO_IP}...")

    # Run servers forever
    try:
        await asyncio.gather(
            http_server.serve_forever(),
            asyncio.Future(),  # run forever
        )
    except KeyboardInterrupt:
        pass
    finally:
        await disco.disconnect()
        ws_server.close()
        http_server.close()
        log.info("Shutdown complete")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutdown.")
