"""Hello, capsule: the REST API from Python with nothing but `requests`.

There is no Python SDK yet; the API is small. This launches a headless Ubuntu capsule,
waits until it is active, runs a command, prints the output, and destroys the capsule.

    pip install requests
    export CAPSULATE_API_KEY=cap_live_...
    python main.py
"""
import os
import sys
import time

import requests

API = os.environ.get("CAPSULATE_BASE_URL", "https://api.capsulate.dev") + "/api/v1"
HEADERS = {"Authorization": f"Bearer {os.environ['CAPSULATE_API_KEY']}"}


def launch(template: str = "ubuntu-22.04-headless", size: str = "1c2g") -> str:
    r = requests.post(f"{API}/sessions", headers=HEADERS, json={"templateId": template, "size": size}, timeout=120)
    if r.status_code >= 400:
        # Failures carry a stable code: no_capacity (retry after Retry-After seconds),
        # insufficient_credits, policy_denied, agent_error, ...
        sys.exit(f"launch failed: {r.status_code} {r.json()}")
    return r.json()["sessionId"]


def wait_active(sid: str, timeout_s: int = 120) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        s = requests.get(f"{API}/sessions/{sid}", headers=HEADERS, timeout=30).json()
        if s.get("status") == "ACTIVE":
            return
        time.sleep(1)
    sys.exit("capsule did not become ACTIVE in time")


def exec_cmd(sid: str, cmd: list[str]) -> dict:
    return requests.post(f"{API}/sessions/{sid}/exec", headers=HEADERS, json={"cmd": cmd}, timeout=300).json()


def destroy(sid: str) -> None:
    requests.delete(f"{API}/sessions/{sid}", headers=HEADERS, timeout=60)


if __name__ == "__main__":
    t0 = time.time()
    sid = launch()
    wait_active(sid)
    print(f"capsule {sid} active in {time.time() - t0:.1f}s")
    try:
        out = exec_cmd(sid, ["python3", "-c", "print(6 * 7)"])
        print("stdout:", out.get("stdout", "").strip(), "exit:", out.get("exitCode"))
    finally:
        destroy(sid)
        print("destroyed")
