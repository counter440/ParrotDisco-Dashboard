#!/usr/bin/env python3
"""Deploy the telemetry agent with 4G signal support to the Disco via telnet."""
import socket
import time
import base64

DISCO_IP = "10.95.46.222"

SCRIPT = r"""#!/bin/sh
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


def main():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3)
    s.connect((DISCO_IP, 23))
    time.sleep(1)
    s.recv(4096)  # banner

    # Kill old agent
    print("[deploy] Killing old agent...")
    telnet_cmd(s, 'killall -9 telem.sh nc 2>/dev/null', 2)

    # Upload script via base64
    b64 = base64.b64encode(SCRIPT.encode()).decode()
    print(f"[deploy] Uploading script ({len(SCRIPT)} bytes)...")

    # Write base64 in chunks
    chunk_size = 400
    for i in range(0, len(b64), chunk_size):
        chunk = b64[i:i + chunk_size]
        op = '>' if i == 0 else '>>'
        telnet_cmd(s, f'printf "{chunk}" {op} /tmp/telem.b64', 1)

    # Decode and make executable
    print("[deploy] Decoding and starting...")
    telnet_cmd(s, 'base64 -d /tmp/telem.b64 > /tmp/telem.sh && chmod +x /tmp/telem.sh', 2)

    # Verify
    resp = telnet_cmd(s, 'head -3 /tmp/telem.sh', 1)
    print(f"[deploy] Script head: {resp.strip()}")

    # Start
    telnet_cmd(s, '/tmp/telem.sh &', 3)
    resp = telnet_cmd(s, 'ps | grep telem', 1)
    print(f"[deploy] Process: {resp.strip()}")

    s.close()

    # Test
    print("[deploy] Testing telemetry...")
    time.sleep(4)
    c = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    c.settimeout(8)
    try:
        c.connect((DISCO_IP, 8889))
        data = c.recv(4096)
        print(f"[deploy] Got:\n{data.decode()}")
    except Exception as e:
        print(f"[deploy] Test error: {e}")
    finally:
        c.close()


if __name__ == '__main__':
    main()
