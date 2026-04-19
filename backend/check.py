"""
TrafficOS — System Health & Pre-flight Check
Run this before starting the server: python check.py
"""

import sys
import os
import importlib
import subprocess
import socket

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

OK   = f"{GREEN}✓{RESET}"
FAIL = f"{RED}✗{RESET}"
WARN = f"{YELLOW}⚠{RESET}"

passed = 0
failed = 0
warnings = 0

def check(label: str, condition: bool, detail: str = "", warn_only=False):
    global passed, failed, warnings
    if condition:
        print(f"  {OK}  {label}")
        passed += 1
    elif warn_only:
        print(f"  {WARN}  {label}  {YELLOW}{detail}{RESET}")
        warnings += 1
    else:
        print(f"  {FAIL}  {label}  {RED}{detail}{RESET}")
        failed += 1

def section(title: str):
    print(f"\n{BOLD}{CYAN}── {title} {'─' * (45 - len(title))}{RESET}")

# ── Python version ─────────────────────────────────────────────────────────────
section("Python Environment")
check("Python 3.10+",
      sys.version_info >= (3, 10),
      f"Found {sys.version_info.major}.{sys.version_info.minor} — need 3.10+")

# ── Required packages ──────────────────────────────────────────────────────────
section("Required Packages")
REQUIRED = {
    "fastapi":    "FastAPI web framework",
    "uvicorn":    "ASGI server",
    "websockets": "WebSocket support",
}
OPTIONAL = {
    "asyncpg":      "PostgreSQL async driver (for DB persistence)",
    "python_dotenv": "Load .env config file",
}

for pkg, desc in REQUIRED.items():
    try:
        importlib.import_module(pkg)
        check(f"{pkg} — {desc}", True)
    except ImportError:
        check(f"{pkg} — {desc}", False, "Run: pip install -r requirements.txt")

for pkg, desc in OPTIONAL.items():
    try:
        importlib.import_module(pkg.replace("-", "_"))
        check(f"{pkg} — {desc} (optional)", True)
    except ImportError:
        check(f"{pkg} — {desc} (optional)", True, "not installed", warn_only=True)

# ── Environment file ───────────────────────────────────────────────────────────
section("Configuration")
env_path = os.path.join(os.path.dirname(__file__), ".env")
env_example = os.path.join(os.path.dirname(__file__), ".env.example")

check(".env file exists", os.path.exists(env_path),
      "Copy .env.example → .env and fill in values", warn_only=True)
check(".env.example exists", os.path.exists(env_example),
      "Missing template file", warn_only=True)

# ── Port availability ──────────────────────────────────────────────────────────
section("Port Availability")
for port, service in [(8000, "Backend API"), (3000, "React Frontend")]:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(("127.0.0.1", port))
        sock.close()
        if result == 0:
            check(f"Port {port} ({service})", False,
                  f"Port {port} already in use — stop the existing process", warn_only=True)
        else:
            check(f"Port {port} ({service}) is free", True)
    except Exception as e:
        check(f"Port {port} check", False, str(e), warn_only=True)

# ── Project file integrity ─────────────────────────────────────────────────────
section("Project File Integrity")
BASE = os.path.dirname(os.path.abspath(__file__))
BACKEND_FILES = [
    "main.py",
    "requirements.txt",
    "schema.sql",
    "check.py",
    ".env.example",
]
FRONTEND_FILES = [
    "../frontend/package.json",
    "../frontend/public/index.html",
    "../frontend/src/index.js",
    "../frontend/src/App.js",
    "../frontend/src/hooks/useSimulation.js",
    "../frontend/src/components/SimulationCanvas.js",
    "../frontend/src/components/MetricsPanel.js",
    "../frontend/src/components/RobotPanel.js",
    "../frontend/src/components/LanePanel.js",
]

for f in BACKEND_FILES:
    path = os.path.join(BASE, f)
    check(f"backend/{f}", os.path.exists(path), f"Missing — {path}")

for f in FRONTEND_FILES:
    path = os.path.normpath(os.path.join(BASE, f))
    label = f.replace("../", "")
    check(label, os.path.exists(path), f"Missing — {path}")

# ── Node / npm ──────────────────────────────────────────────────────────────────
section("Node.js / npm (for React frontend)")
try:
    node_ver = subprocess.check_output(["node", "--version"],
                                       stderr=subprocess.DEVNULL).decode().strip()
    major = int(node_ver.lstrip("v").split(".")[0])
    check(f"Node.js {node_ver}", major >= 16, "Need Node 16+")
except FileNotFoundError:
    check("Node.js", False, "Not found — install from https://nodejs.org")

try:
    npm_ver = subprocess.check_output(["npm", "--version"],
                                      stderr=subprocess.DEVNULL).decode().strip()
    check(f"npm {npm_ver}", True)
except FileNotFoundError:
    check("npm", False, "Not found — comes bundled with Node.js")

# ── PostgreSQL (optional) ──────────────────────────────────────────────────────
section("PostgreSQL (optional — for persistence)")
try:
    result = subprocess.run(["pg_isready"], capture_output=True, text=True, timeout=3)
    check("PostgreSQL server is ready", result.returncode == 0,
          "Not running — simulation works without it", warn_only=True)
except FileNotFoundError:
    check("PostgreSQL", True, "pg_isready not found — simulation works without DB", warn_only=True)

# ── Summary ────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}{'─' * 50}{RESET}")
total = passed + failed + warnings
print(f"  {OK}  Passed:   {GREEN}{passed}{RESET}")
if warnings:
    print(f"  {WARN}  Warnings: {YELLOW}{warnings}{RESET}")
if failed:
    print(f"  {FAIL}  Failed:   {RED}{failed}{RESET}")
print(f"{BOLD}{'─' * 50}{RESET}\n")

if failed == 0:
    print(f"{GREEN}{BOLD}All checks passed! Run: python main.py{RESET}\n")
else:
    print(f"{RED}{BOLD}Fix the errors above before starting the server.{RESET}\n")
    sys.exit(1)