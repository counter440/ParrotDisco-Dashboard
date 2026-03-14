#!/usr/bin/env python3
"""Deploy telemetry + PWM agents to persistent storage and set up autostart on boot."""
import socket
import time
import base64

DISCO_IP = "10.95.46.222"

# Combined startup script — launches both agents
STARTUP_SCRIPT = r"""#!/bin/sh
# GCS agents autostart — deployed to /data/ftp/internal_000/gcs/
# Launched by uavpal_disco.sh hook
BASEDIR="/data/ftp/internal_000/gcs"

# Wait for network and services
sleep 10

# Start telemetry agent
if [ -f "$BASEDIR/telem.sh" ]; then
  sh "$BASEDIR/telem.sh" &
  echo "[gcs] Telemetry agent started"
fi

# Start PWM agent
if [ -f "$BASEDIR/pwm_agent.sh" ]; then
  sh "$BASEDIR/pwm_agent.sh" &
  echo "[gcs] PWM agent started"
fi
"""

# Telemetry agent
TELEM_SCRIPT = r"""#!/bin/sh
get_signal() {
  SR=$(printf "GET /api/webserver/SesTokInfo HTTP/1.1\r\nHost: 192.168.8.1\r\nConnection: close\r\n\r\n" | nc 192.168.8.1 80 2>/dev/null)
  SES=$(echo "$SR" | grep SesInfo | sed 's/<[^>]*>//g' | tr -d ' ')
  TOK=$(echo "$SR" | grep TokInfo | sed 's/<[^>]*>//g' | tr -d ' ')
  printf "GET /api/device/signal HTTP/1.1\r\nHost: 192.168.8.1\r\nCookie: $SES\r\n__RequestVerificationToken: $TOK\r\nConnection: close\r\n\r\n" | nc 192.168.8.1 80 2>/dev/null
}
get_sats() {
  NMEA=$(dd if=/tmp/gps_nmea_out bs=1 count=500 2>/dev/null)
  GPS=$(echo "$NMEA" | grep '$GPGSV' | head -1 | cut -d',' -f4)
  GLO=$(echo "$NMEA" | grep '$GLGSV' | head -1 | cut -d',' -f4)
  GPS=${GPS:-0}
  GLO=${GLO:-0}
  echo $((GPS + GLO))
}
while true; do
  GT=$(cat /tmp/temp_gyro 2>/dev/null || echo 0)
  SL=$(cat /sys/devices/platform/p7_pwm.0/pwm/pwm_3/duty_ns 2>/dev/null || echo 1500000)
  SR2=$(cat /sys/devices/platform/p7_pwm.0/pwm/pwm_4/duty_ns 2>/dev/null || echo 1500000)
  SIG=$(get_signal)
  RSSI=$(echo "$SIG" | sed -n 's/.*<rssi>\([^<]*\)<.*/\1/p')
  RSRP=$(echo "$SIG" | sed -n 's/.*<rsrp>\([^<]*\)<.*/\1/p')
  RSRQ=$(echo "$SIG" | sed -n 's/.*<rsrq>\([^<]*\)<.*/\1/p')
  SINR=$(echo "$SIG" | sed -n 's/.*<sinr>\([^<]*\)<.*/\1/p')
  SATS=$(get_sats)
  printf "voltage=0\ngyro_temp=%s\nservo_left=%s\nservo_right=%s\npitot_raw=0\nrssi=%s\nrsrp=%s\nrsrq=%s\nsinr=%s\ngps_sats=%s\n" "$GT" "$SL" "$SR2" "$RSSI" "$RSRP" "$RSRQ" "$SINR" "$SATS" | nc -l -p 8889
  sleep 1
done
"""

# PWM agent
PWM_SCRIPT = r"""#!/bin/sh
PORT=8890
SL="/sys/devices/platform/p7_pwm.0/pwm/pwm_3/duty_ns"
SR="/sys/devices/platform/p7_pwm.0/pwm/pwm_4/duty_ns"
SLR="/sys/devices/platform/p7_pwm.0/pwm/pwm_3/run"
SRR="/sys/devices/platform/p7_pwm.0/pwm/pwm_4/run"
MOT="/sys/devices/platform/p7_pwm.0/pwm/pwm_10/duty_ns"
FIFO="/tmp/pwm_fifo"

cleanup() {
  echo 1500000 > $SL; echo 1500000 > $SR; echo 0 > $MOT
  echo 0 > $SLR; echo 0 > $SRR
  rm -f $FIFO
  exit 0
}
trap cleanup INT TERM

rm -f $FIFO
mkfifo $FIFO

process_cmd() {
  while read cmd A B; do
    case "$cmd" in
      S) echo $A > $SL; echo $B > $SR ;;
      M) echo $A > $MOT ;;
      E) echo 1500000 > $SL; echo 1500000 > $SR; echo 1 > $SLR; echo 1 > $SRR ;;
      D) echo 1500000 > $SL; echo 1500000 > $SR; echo 0 > $MOT; echo 0 > $SLR; echo 0 > $SRR ;;
    esac
  done
}

while true; do
  nc -l -p $PORT > $FIFO &
  NC_PID=$!
  process_cmd < $FIFO
  wait $NC_PID 2>/dev/null
  echo 1500000 > $SL; echo 1500000 > $SR; echo 0 > $MOT
  echo 0 > $SLR; echo 0 > $SRR
  sleep 1
done
"""

HOOK_LINE = '# GCS agents\n[ -x /data/ftp/internal_000/gcs/start.sh ] && /data/ftp/internal_000/gcs/start.sh &'


def telnet_cmd(sock, cmd, wait=2):
    sock.sendall(cmd.encode() + b'\n')
    time.sleep(wait)
    resp = b''
    try:
        while True:
            chunk = sock.recv(8192)
            if not chunk:
                break
            resp += chunk
    except socket.timeout:
        pass
    return resp.decode(errors='replace')


def upload_script(sock, content, remote_path):
    """Upload a script via base64 over telnet."""
    b64 = base64.b64encode(content.encode()).decode()
    chunk_size = 400
    for i in range(0, len(b64), chunk_size):
        chunk = b64[i:i + chunk_size]
        op = '>' if i == 0 else '>>'
        telnet_cmd(sock, f'printf "{chunk}" {op} /tmp/upload.b64', 0.5)
    telnet_cmd(sock, f'base64 -d /tmp/upload.b64 > {remote_path} && chmod +x {remote_path}', 1)
    telnet_cmd(sock, 'rm -f /tmp/upload.b64', 0.5)


def main():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3)
    s.connect((DISCO_IP, 23))
    time.sleep(1)
    s.recv(4096)

    # Create directory
    print("[deploy] Creating /data/ftp/internal_000/gcs/ ...")
    telnet_cmd(s, 'mkdir -p /data/ftp/internal_000/gcs', 1)

    # Kill existing agents
    print("[deploy] Killing old agents...")
    telnet_cmd(s, 'killall -9 telem.sh pwm_agent.sh 2>/dev/null; killall -9 nc 2>/dev/null', 2)

    # Upload scripts
    print("[deploy] Uploading startup script...")
    upload_script(s, STARTUP_SCRIPT, '/data/ftp/internal_000/gcs/start.sh')

    print("[deploy] Uploading telemetry agent...")
    upload_script(s, TELEM_SCRIPT, '/data/ftp/internal_000/gcs/telem.sh')

    print("[deploy] Uploading PWM agent...")
    upload_script(s, PWM_SCRIPT, '/data/ftp/internal_000/gcs/pwm_agent.sh')

    # Verify
    resp = telnet_cmd(s, 'ls -la /data/ftp/internal_000/gcs/', 1)
    print(f"[deploy] Files: {resp.strip()}")

    # Add hook to uavpal_disco.sh if not already present
    print("[deploy] Checking UAVPAL autostart hook...")
    resp = telnet_cmd(s, 'grep -c "gcs/start.sh" /data/ftp/uavpal/bin/uavpal_disco.sh 2>/dev/null', 1)
    if '0' in resp or 'No such' in resp:
        print("[deploy] Adding autostart hook to uavpal_disco.sh...")
        # Insert before the closing "} &" line
        telnet_cmd(s, r"sed -i 's|^ulogger -s -t uavpal_drone \"\*\*\* idle on LTE \*\*\*\"|# GCS agents\n[ -x /data/ftp/internal_000/gcs/start.sh ] \&\& /data/ftp/internal_000/gcs/start.sh \&\nulogger -s -t uavpal_drone \"*** idle on LTE ***\"|' /data/ftp/uavpal/bin/uavpal_disco.sh", 2)
        # Verify
        resp = telnet_cmd(s, 'grep "gcs" /data/ftp/uavpal/bin/uavpal_disco.sh', 1)
        print(f"[deploy] Hook: {resp.strip()}")
    else:
        print("[deploy] Autostart hook already present")

    # Start agents now
    print("[deploy] Starting agents...")
    telnet_cmd(s, '/data/ftp/internal_000/gcs/start.sh &', 5)
    resp = telnet_cmd(s, 'ps | grep -E "telem|pwm_agent"', 1)
    print(f"[deploy] Running: {resp.strip()}")

    s.close()

    # Test telemetry
    print("[deploy] Testing telemetry agent...")
    time.sleep(3)
    c = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    c.settimeout(8)
    try:
        c.connect((DISCO_IP, 8889))
        data = c.recv(4096)
        print(f"[deploy] Telemetry OK:\n{data.decode()}")
    except Exception as e:
        print(f"[deploy] Telemetry test failed: {e}")
    finally:
        c.close()

    print("[deploy] Done! Agents will auto-start on every boot.")


if __name__ == '__main__':
    main()
