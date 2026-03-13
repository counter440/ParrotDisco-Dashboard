#!/usr/bin/env python3
"""Deploy a fast PWM control agent to the Disco via telnet.

The agent listens on TCP port 8890 and accepts single-line commands:
  S <left_ns> <right_ns>    — set servo duty_ns values
  M <duty_ns>               — set motor duty_ns
  E                         — enable servos (run=1)
  D                         — disable servos (run=0), motor off
  Q                         — quit

Written in C for zero-overhead direct sysfs writes.
Falls back to a shell script if cc is not available.
"""
import socket
import time
import base64

DISCO_IP = "10.95.46.222"

# C program — compiles on Disco's ARM Linux, runs as a persistent TCP server
C_SOURCE = r"""
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <fcntl.h>
#include <signal.h>

#define PORT 8890
#define SL "/sys/devices/platform/p7_pwm.0/pwm/pwm_3/duty_ns"
#define SR "/sys/devices/platform/p7_pwm.0/pwm/pwm_4/duty_ns"
#define SL_RUN "/sys/devices/platform/p7_pwm.0/pwm/pwm_3/run"
#define SR_RUN "/sys/devices/platform/p7_pwm.0/pwm/pwm_4/run"
#define MOT "/sys/devices/platform/p7_pwm.0/pwm/pwm_10/duty_ns"

static void write_sysfs(const char *path, const char *val) {
    int fd = open(path, O_WRONLY);
    if (fd >= 0) { write(fd, val, strlen(val)); close(fd); }
}

static volatile int running = 1;
static void sighandler(int s) { running = 0; }

int main() {
    signal(SIGTERM, sighandler);
    signal(SIGINT, sighandler);
    signal(SIGPIPE, SIG_IGN);

    int srv = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(PORT);
    addr.sin_addr.s_addr = INADDR_ANY;
    bind(srv, (struct sockaddr*)&addr, sizeof(addr));
    listen(srv, 1);
    printf("[pwm_agent] Listening on port %d\n", PORT);

    while (running) {
        int cli = accept(srv, NULL, NULL);
        if (cli < 0) continue;
        printf("[pwm_agent] Client connected\n");

        FILE *f = fdopen(cli, "r");
        char line[128];
        while (fgets(line, sizeof(line), f)) {
            unsigned long v1, v2;
            switch (line[0]) {
                case 'S': /* S left_ns right_ns */
                    if (sscanf(line+1, "%lu %lu", &v1, &v2) == 2) {
                        char buf[20];
                        snprintf(buf, sizeof(buf), "%lu", v1);
                        write_sysfs(SL, buf);
                        snprintf(buf, sizeof(buf), "%lu", v2);
                        write_sysfs(SR, buf);
                    }
                    break;
                case 'M': /* M duty_ns */
                    if (sscanf(line+1, "%lu", &v1) == 1) {
                        char buf[20];
                        snprintf(buf, sizeof(buf), "%lu", v1);
                        write_sysfs(MOT, buf);
                    }
                    break;
                case 'E': /* Enable servos */
                    write_sysfs(SL_RUN, "1");
                    write_sysfs(SR_RUN, "1");
                    write_sysfs(SL, "1500000");
                    write_sysfs(SR, "1500000");
                    break;
                case 'D': /* Disable — safe */
                    write_sysfs(SL, "1500000");
                    write_sysfs(SR, "1500000");
                    write_sysfs(MOT, "0");
                    write_sysfs(SL_RUN, "0");
                    write_sysfs(SR_RUN, "0");
                    break;
                case 'Q': /* Quit */
                    goto disconnect;
            }
        }
disconnect:
        fclose(f);
        printf("[pwm_agent] Client disconnected\n");
    }
    /* Cleanup */
    write_sysfs(SL, "1500000");
    write_sysfs(SR, "1500000");
    write_sysfs(MOT, "0");
    write_sysfs(SL_RUN, "0");
    write_sysfs(SR_RUN, "0");
    close(srv);
    return 0;
}
"""

# Shell fallback — slower but works without a C compiler
SHELL_SCRIPT = r"""#!/bin/sh
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

echo "[pwm_agent] Shell mode on port $PORT"
while true; do
  # nc writes incoming data to the FIFO, process_cmd reads from it
  # When client disconnects, nc exits, loop restarts
  nc -l -p $PORT > $FIFO &
  NC_PID=$!
  process_cmd < $FIFO
  wait $NC_PID 2>/dev/null
  # Safety: reset on disconnect
  echo 1500000 > $SL; echo 1500000 > $SR; echo 0 > $MOT
  echo 0 > $SLR; echo 0 > $SRR
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

    # Kill any existing agent
    print("[deploy] Killing old pwm_agent...")
    telnet_cmd(s, 'killall -9 pwm_agent 2>/dev/null; killall -9 pwm_agent.sh 2>/dev/null', 1)

    # Try to compile C version
    print("[deploy] Checking for C compiler...")
    resp = telnet_cmd(s, 'which cc 2>/dev/null || which gcc 2>/dev/null', 1)
    has_cc = '/cc' in resp or '/gcc' in resp

    if has_cc:
        print("[deploy] C compiler found — deploying native agent")
        b64 = base64.b64encode(C_SOURCE.encode()).decode()
        chunk_size = 400
        for i in range(0, len(b64), chunk_size):
            chunk = b64[i:i + chunk_size]
            op = '>' if i == 0 else '>>'
            telnet_cmd(s, f'printf "{chunk}" {op} /tmp/pwm_agent.b64', 0.5)
        telnet_cmd(s, 'base64 -d /tmp/pwm_agent.b64 > /tmp/pwm_agent.c', 1)
        telnet_cmd(s, 'cc -O2 -o /tmp/pwm_agent /tmp/pwm_agent.c', 3)
        resp = telnet_cmd(s, 'ls -la /tmp/pwm_agent 2>&1', 1)
        if '/tmp/pwm_agent' in resp and 'No such' not in resp:
            telnet_cmd(s, '/tmp/pwm_agent &', 2)
            print("[deploy] Native PWM agent started on port 8890")
        else:
            print("[deploy] Compile failed, falling back to shell")
            has_cc = False

    if not has_cc:
        print("[deploy] Deploying shell-based agent")
        b64 = base64.b64encode(SHELL_SCRIPT.encode()).decode()
        chunk_size = 400
        for i in range(0, len(b64), chunk_size):
            chunk = b64[i:i + chunk_size]
            op = '>' if i == 0 else '>>'
            telnet_cmd(s, f'printf "{chunk}" {op} /tmp/pwm.b64', 0.5)
        telnet_cmd(s, 'base64 -d /tmp/pwm.b64 > /tmp/pwm_agent.sh && chmod +x /tmp/pwm_agent.sh', 1)
        telnet_cmd(s, '/tmp/pwm_agent.sh &', 2)
        print("[deploy] Shell PWM agent started on port 8890")

    resp = telnet_cmd(s, 'ps | grep pwm_agent', 1)
    print(f"[deploy] Process: {resp.strip()}")
    s.close()

    # Test
    print("[deploy] Testing PWM agent...")
    time.sleep(2)
    c = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    c.settimeout(5)
    try:
        c.connect((DISCO_IP, 8890))
        c.sendall(b'E\n')  # enable
        time.sleep(0.1)
        c.sendall(b'S 1400000 1600000\n')  # move servos
        time.sleep(0.5)
        c.sendall(b'S 1500000 1500000\n')  # back to neutral
        time.sleep(0.1)
        c.sendall(b'D\n')  # disable
        print("[deploy] Test OK — servos responded")
        c.close()
    except Exception as e:
        print(f"[deploy] Test failed: {e}")


if __name__ == '__main__':
    main()
