#!/usr/bin/env python3
"""
Deploy cockpit_agent.sh to Parrot Disco via FTP and start it via telnet.
"""

import ftplib
import socket
import sys
import time
from pathlib import Path

DISCO_IP = "192.168.42.1"
FTP_PORT = 21
TELNET_PORT = 23
REMOTE_DIR = "/data/ftp/internal_000"
REMOTE_PATH = f"{REMOTE_DIR}/cockpit_agent.sh"
LOCAL_FILE = Path(__file__).parent / "cockpit_agent.sh"


def ftp_upload():
    """Upload cockpit_agent.sh to Disco via FTP."""
    print(f"[deploy] Connecting to FTP {DISCO_IP}:{FTP_PORT}...")
    ftp = ftplib.FTP()
    ftp.connect(DISCO_IP, FTP_PORT, timeout=5)
    ftp.login()  # Disco FTP is anonymous
    print(f"[deploy] Connected. Uploading {LOCAL_FILE.name}...")

    ftp.cwd(REMOTE_DIR)
    with open(LOCAL_FILE, "rb") as f:
        ftp.storbinary(f"STOR cockpit_agent.sh", f)

    ftp.quit()
    print("[deploy] Upload complete.")


def telnet_exec(command: str) -> str:
    """Execute a command on Disco via raw telnet socket."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((DISCO_IP, TELNET_PORT))

    # Read banner/prompt
    time.sleep(0.5)
    try:
        sock.recv(4096)
    except socket.timeout:
        pass

    # Send command
    sock.sendall((command + "\n").encode())
    time.sleep(0.5)

    # Read response
    response = b""
    try:
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response += chunk
    except socket.timeout:
        pass

    sock.close()
    return response.decode(errors="replace")


def start_agent():
    """Start cockpit_agent.sh on the Disco."""
    print("[deploy] Starting cockpit_agent.sh on Disco...")
    # Kill any existing instance, make executable, and start in background
    telnet_exec(f"chmod +x {REMOTE_PATH}")
    telnet_exec(f"killall -q cockpit_agent.sh 2>/dev/null; {REMOTE_PATH} &")
    print("[deploy] Agent started.")


def stop_agent():
    """Stop cockpit_agent.sh on the Disco."""
    print("[deploy] Stopping cockpit_agent.sh...")
    telnet_exec("killall cockpit_agent.sh 2>/dev/null")
    print("[deploy] Agent stopped.")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "stop":
        stop_agent()
        return

    if not LOCAL_FILE.exists():
        print(f"[deploy] ERROR: {LOCAL_FILE} not found")
        sys.exit(1)

    ftp_upload()
    start_agent()
    print(f"[deploy] Done. Agent running on {DISCO_IP}:8888")


if __name__ == "__main__":
    main()
