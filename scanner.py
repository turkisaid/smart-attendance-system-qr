#!/usr/bin/env python3
"""
UTAS-Sohar Attendance System — Raspberry Pi QR Scanner
-------------------------------------------------------
Reads frames from the Pi camera, decodes QR codes with pyzbar,
and POSTs each valid token to the PHP backend for verification.

QR payload format (set by qr.js):
    UTAS-ATTEND|<studentId>|<courseId>|<token>

Usage:
    python3 scanner.py
    Press Ctrl+C to stop.
"""

import time
import sys
import requests
from picamera2 import Picamera2
from pyzbar.pyzbar import decode as decode_qr


# ── Configuration ──────────────────────────────────────────────────────────────

BACKEND_URL     = "http://172.20.10.7:8080/attendance-system/backend/qr_verify.php"
COOLDOWN_SECONDS = 10   # Ignore the same QR token for this many seconds after a scan
REQUEST_TIMEOUT  = 5    # HTTP request timeout in seconds
CAMERA_WIDTH     = 1280
CAMERA_HEIGHT    = 720
FRAME_SLEEP      = 0.1  # Seconds between captures (~10 fps); keeps CPU usage low


# ── ANSI colour helpers ────────────────────────────────────────────────────────

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def print_success(msg: str) -> None:
    """Print a green success line."""
    print(f"{GREEN}{BOLD}✅  {msg}{RESET}")

def print_failure(msg: str) -> None:
    """Print a red failure line."""
    print(f"{RED}{BOLD}❌  {msg}{RESET}")

def print_info(msg: str) -> None:
    """Print a yellow informational line."""
    print(f"{YELLOW}{msg}{RESET}")

def print_scan(msg: str) -> None:
    """Print a cyan scan-event line."""
    print(f"{CYAN}🔍  {msg}{RESET}")


# ── QR payload parser ──────────────────────────────────────────────────────────

def parse_qr_payload(raw: str):
    """
    Parse a raw QR string produced by qr.js.

    Expected format:
        UTAS-ATTEND|<studentId>|<courseId>|<token>

    Returns:
        (token: str, course_id: int)  on success
        None                          if the payload is not a UTAS attendance QR
    """
    parts = raw.strip().split("|")

    if len(parts) != 4:
        return None

    prefix, student_id_str, course_id_str, token = parts

    if prefix != "UTAS-ATTEND":
        return None  # Not our QR — ignore silently

    try:
        course_id = int(course_id_str)
    except ValueError:
        return None

    if not token:
        return None

    return token, course_id


# ── Backend communication ──────────────────────────────────────────────────────

def verify_token(token: str, course_id: int) -> None:
    """
    POST the scanned token to qr_verify.php.

    Expected request body:
        { "token": "<token>", "course_id": <int> }

    Prints a green success or red rejection message based on the response.
    """
    payload = {"token": token, "course_id": course_id}

    try:
        response = requests.post(
            BACKEND_URL,
            json=payload,
            timeout=REQUEST_TIMEOUT,
            headers={"Content-Type": "application/json"},
        )

        # Try to parse JSON regardless of status code
        try:
            data = response.json()
        except ValueError:
            print_failure(f"Rejected — Backend returned non-JSON response (HTTP {response.status_code})")
            return

        if response.status_code == 201:
            # Successful attendance record
            student_name   = data.get("student_name",   "Unknown")
            student_number = data.get("student_number", "")
            scanned_at     = data.get("scanned_at",     "")
            detail = f"Student: {student_name}"
            if student_number:
                detail += f"  |  Roll: {student_number}"
            if scanned_at:
                detail += f"  |  Time: {scanned_at}"
            print_success(f"Attendance Recorded — {detail}")

        elif response.status_code == 409:
            # Already recorded today
            reason = data.get("error", data.get("message", "Already recorded today"))
            print_failure(f"Rejected — {reason}")

        elif response.status_code == 401:
            # Invalid or expired token
            reason = data.get("error", data.get("message", "Invalid or expired token"))
            print_failure(f"Rejected — {reason}")

        else:
            # Any other error
            reason = data.get("error", data.get("message", f"HTTP {response.status_code}"))
            print_failure(f"Rejected — {reason}")

    except requests.exceptions.ConnectionError:
        print_failure("Rejected — Cannot reach backend (check Wi-Fi / IP address)")

    except requests.exceptions.Timeout:
        print_failure(f"Rejected — Backend did not respond within {REQUEST_TIMEOUT}s")

    except Exception as exc:
        print_failure(f"Rejected — Unexpected error: {exc}")


# ── Main scan loop ─────────────────────────────────────────────────────────────

def main() -> None:
    print_info("=" * 55)
    print_info("  UTAS-Sohar  |  QR Attendance Scanner")
    print_info(f"  Backend : {BACKEND_URL}")
    print_info(f"  Cooldown: {COOLDOWN_SECONDS}s  |  Timeout: {REQUEST_TIMEOUT}s")
    print_info("=" * 55)

    # ── Initialise camera ──────────────────────────────────────────────────────
    print_info("\nInitialising camera…")
    camera = Picamera2()

    # RGB888 format is required by pyzbar (3-channel uint8)
    config = camera.create_still_configuration(
        main={"size": (CAMERA_WIDTH, CAMERA_HEIGHT), "format": "RGB888"}
    )
    camera.configure(config)
    camera.start()
    time.sleep(1)  # Give the sensor time to adjust exposure

    print_info("Camera ready. Scanning for QR codes…")
    print_info("Press Ctrl+C to stop.\n")

    # ── Cooldown tracker ───────────────────────────────────────────────────────
    # Maps token string → Unix timestamp of last successful dispatch
    cooldown_cache: dict = {}

    # ── Scan loop ──────────────────────────────────────────────────────────────
    try:
        while True:
            # Capture one frame as a NumPy array (RGB888)
            frame = camera.capture_array()

            # Decode every QR code visible in the frame
            detected = decode_qr(frame)

            for qr_obj in detected:
                # Decode bytes → str, skip on encoding errors
                raw = qr_obj.data.decode("utf-8", errors="ignore").strip()

                parsed = parse_qr_payload(raw)
                if parsed is None:
                    # Not a UTAS attendance QR — ignore silently
                    continue

                token, course_id = parsed

                # ── Cooldown check ─────────────────────────────────────────────
                now       = time.time()
                last_scan = cooldown_cache.get(token, 0)

                if now - last_scan < COOLDOWN_SECONDS:
                    remaining = int(COOLDOWN_SECONDS - (now - last_scan))
                    print_info(f"  ⏳  Same QR seen again — cooldown {remaining}s remaining")
                    continue

                # Record the scan time before the network call
                cooldown_cache[token] = now

                print_scan(f"QR detected → course_id={course_id}  Contacting backend…")
                verify_token(token, course_id)

            # Sleep between frames to keep CPU usage low
            time.sleep(FRAME_SLEEP)

    except KeyboardInterrupt:
        print_info("\n\nScanner stopped by user (Ctrl+C).")

    finally:
        # Always release the camera cleanly
        camera.stop()
        print_info("Camera closed. Goodbye.")
        sys.exit(0)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
