#!/bin/sh
#
# cockpit_agent.sh — Extra telemetry agent for Parrot Disco CHUCK
# Deploy to /data/ftp/internal_000/cockpit_agent.sh
# Exposes pitot, servo, IMU, and battery ADC data via TCP port 8888
#
# Usage: Run on Disco via telnet/FTP. Listens for TCP connections and
# returns a key=value telemetry snapshot per connection.

PORT=8888
INTERVAL=0.2

# ── Sensor paths ────────────────────────────────────────
# These paths are for the Disco's CHUCK (Linux 3.4, Parrot custom kernel)
BATT_VOLTAGE="/sys/devices/platform/p7mu-adc/iio:device0/in_voltage0_raw"
BATT_SCALE="/sys/devices/platform/p7mu-adc/iio:device0/in_voltage_scale"
GYRO_TEMP="/sys/devices/platform/p7mu-adc/iio:device0/in_temp_raw"
GYRO_TEMP_SCALE="/sys/devices/platform/p7mu-adc/iio:device0/in_temp_scale"
PITOT_PATH="/sys/devices/platform/p7mu-adc/iio:device0/in_voltage3_raw"
SERVO_LEFT="/sys/class/pwm/pwmchip0/pwm0/duty_cycle"
SERVO_RIGHT="/sys/class/pwm/pwmchip0/pwm1/duty_cycle"

# Fallback paths (older firmware)
if [ ! -f "$BATT_VOLTAGE" ]; then
    BATT_VOLTAGE="/sys/bus/iio/devices/iio:device0/in_voltage0_raw"
    BATT_SCALE="/sys/bus/iio/devices/iio:device0/in_voltage_scale"
    GYRO_TEMP="/sys/bus/iio/devices/iio:device0/in_temp_raw"
    GYRO_TEMP_SCALE="/sys/bus/iio/devices/iio:device0/in_temp_scale"
    PITOT_PATH="/sys/bus/iio/devices/iio:device0/in_voltage3_raw"
fi

# ── Helper: safe read ──────────────────────────────────
read_val() {
    if [ -f "$1" ]; then
        cat "$1" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# ── Helper: compute voltage ────────────────────────────
get_voltage() {
    raw=$(read_val "$BATT_VOLTAGE")
    scale=$(read_val "$BATT_SCALE")
    if [ "$scale" = "0" ] || [ -z "$scale" ]; then
        scale="0.001"
    fi
    # Disco 3S2P pack: ADC reads through voltage divider
    # Typical divider ratio ~11:1, scale in millivolts
    awk "BEGIN { printf \"%.2f\", $raw * $scale * 11 / 1000 }"
}

# ── Helper: compute gyro temperature ──────────────────
get_gyro_temp() {
    raw=$(read_val "$GYRO_TEMP")
    scale=$(read_val "$GYRO_TEMP_SCALE")
    if [ "$scale" = "0" ] || [ -z "$scale" ]; then
        scale="0.001"
    fi
    awk "BEGIN { printf \"%.1f\", $raw * $scale / 1000 }"
}

# ── Helper: read servo PWM in microseconds ────────────
get_servo() {
    duty=$(read_val "$1")
    # duty_cycle is in nanoseconds, convert to microseconds
    if [ "$duty" != "0" ] && [ -n "$duty" ]; then
        awk "BEGIN { printf \"%d\", $duty / 1000 }"
    else
        echo "1500"
    fi
}

# ── Helper: read pitot ADC ────────────────────────────
get_pitot() {
    read_val "$PITOT_PATH"
}

# ── Build telemetry string ─────────────────────────────
build_telemetry() {
    voltage=$(get_voltage)
    gyro_temp=$(get_gyro_temp)
    servo_l=$(get_servo "$SERVO_LEFT")
    servo_r=$(get_servo "$SERVO_RIGHT")
    pitot=$(get_pitot)

    echo "voltage=$voltage"
    echo "gyro_temp=$gyro_temp"
    echo "servo_left=$servo_l"
    echo "servo_right=$servo_r"
    echo "pitot_raw=$pitot"
    echo "timestamp=$(date +%s)"
}

# ── Kill any existing instance ─────────────────────────
kill_existing() {
    # Kill previous instances of this script (except self)
    for pid in $(pgrep -f "cockpit_agent.sh" 2>/dev/null); do
        if [ "$pid" != "$$" ]; then
            kill "$pid" 2>/dev/null
        fi
    done
    # Kill any lingering netcat on our port
    fuser -k ${PORT}/tcp 2>/dev/null
}

# ── Main server loop ──────────────────────────────────
main() {
    kill_existing
    echo "[cockpit_agent] Starting on port $PORT"

    # Check if busybox nc or full netcat is available
    if command -v nc >/dev/null 2>&1; then
        NC="nc"
    elif [ -x /usr/bin/nc ]; then
        NC="/usr/bin/nc"
    else
        echo "[cockpit_agent] ERROR: netcat not found"
        exit 1
    fi

    while true; do
        # Generate telemetry and serve it to one connection
        # -l = listen, -p = port, -q 1 = quit 1s after EOF
        build_telemetry | $NC -l -p $PORT -q 1 2>/dev/null
        # Small delay to prevent tight loop on connection errors
        sleep "$INTERVAL"
    done
}

# ── Signal handling ────────────────────────────────────
cleanup() {
    echo "[cockpit_agent] Stopping"
    fuser -k ${PORT}/tcp 2>/dev/null
    exit 0
}
trap cleanup INT TERM

main
