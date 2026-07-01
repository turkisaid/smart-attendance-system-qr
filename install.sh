#!/bin/bash
# UTAS-Sohar Attendance Scanner — Raspberry Pi installer
# Run once after cloning the project:
#   chmod +x install.sh && ./install.sh

set -e  # Exit immediately on any error

echo "========================================"
echo " UTAS-Sohar QR Scanner — Setup"
echo "========================================"

# ── 1. System packages ────────────────────────────────────────────────────────
echo ""
echo "[1/3] Installing system packages…"
sudo apt-get update -y
sudo apt-get install -y \
    python3-pip \
    libzbar0 \
    libzbar-dev \
    python3-libcamera \
    python3-picamera2

# ── 2. Python packages ────────────────────────────────────────────────────────
echo ""
echo "[2/3] Installing Python packages…"
pip3 install -r requirements.txt

# ── 3. Verify imports ─────────────────────────────────────────────────────────
echo ""
echo "[3/3] Verifying installation…"
python3 - <<'EOF'
import importlib, sys

packages = {
    "picamera2":  "picamera2",
    "pyzbar":     "pyzbar.pyzbar",
    "requests":   "requests",
    "cv2":        "cv2",
    "PIL":        "PIL",
}

all_ok = True
for label, module in packages.items():
    try:
        importlib.import_module(module)
        print(f"  ✅  {label}")
    except ImportError as e:
        print(f"  ❌  {label} — {e}")
        all_ok = False

if not all_ok:
    print("\nSome packages failed. Check errors above.")
    sys.exit(1)
EOF

echo ""
echo "========================================"
echo " Setup complete!"
echo " Run the scanner with:"
echo "   python3 scanner.py"
echo "========================================"
