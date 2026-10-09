"""Launch a Capsulate capsule, run a command inside it, print the output, destroy it.

The whole REST surface used here is four calls: POST /sessions, GET /sessions/{id},
POST /sessions/{id}/exec, DELETE /sessions/{id}. There is no Python SDK yet and this
file is the reason one is not urgent.

    pip install requests
    export CAPSULATE_API_KEY="cap_live_..."
    python main.py
"""

import os
import sys
import time

import requests

BASE = os.environ.get("CAPSULATE_BASE_URL", "https://api.capsulate.dev")
API = f"{BASE}/api/v1"
KEY = os.environ.get("CAPSULATE_API_KEY")
if not KEY:
    sys.exit("Set CAPSULATE_API_KEY first (dashboard: Settings, API and Keys).")

H = {"Authorization": f"Bearer {KEY}"}

TEMPLATE = "ubuntu-22.04-headless"
SIZE = "1c2g"


def launch() -> str:
    """POST /sessions. templateId and size are the only required fields.

    With an API key the team is implied, so teamId is optional. A failed launch
    answers a JSON body with a stable `code`; 503 and 500 also set Retry-After.
    """
    r = requests.post(
        f"{API}/sessions",
        headers=H,
        timeout=60,
        json={"templateId": TEMPLATE, "size": SIZE},
    )
    if r.status_code >= 400:
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        code = body.get("code", "unknown")
        retry_after = r.headers.get("Retry-After")
        if body.get("retryable") and retry_after:
            sys.exit(f"Launch failed ({code}). Retryable: try again in {retry_after}s.")
        sys.exit(f"Launch failed with {r.status_code} ({code}): {body.get('error', r.text)}")
    return r.json()["sessionId"]


def wait_active(session_id: str, timeout_s: int = 120) -> None:
    """Poll until the capsule is ACTIVE. A warm capsule is usually there on the first poll."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        s = requests.get(f"{API}/sessions/{session_id}", headers=H, timeout=30).json()
        status = s.get("status")
        if status == "ACTIVE":
            return
        if status in ("FAILED", "DESTROYED"):
            sys.exit(f"Capsule ended up {status}.")
        time.sleep(1)
    sys.exit("Capsule did not become ACTIVE in time.")


def main() -> None:
    session_id = launch()
    print(f"launched {session_id}")
    try:
        wait_active(session_id)

        # cmd is an argv array, not a shell string. Wrap it yourself for shell semantics.
        out = requests.post(
            f"{API}/sessions/{session_id}/exec",
            headers=H,
            timeout=120,
            json={
                "sessionId": session_id,
                "cmd": ["/bin/sh", "-lc", "python3 -c 'print(6 * 7)' && uname -sr"],
            },
        ).json()
        print(out["stdout"].rstrip())
        if out.get("stderr"):
            print(out["stderr"].rstrip(), file=sys.stderr)
        print(f"exit code {out['exitCode']}")
    finally:
        # Always destroy. A capsule is metered per second until it is destroyed or
        # suspended, and a free account may only run one at a time.
        d = requests.delete(f"{API}/sessions/{session_id}", headers=H, timeout=60)
        final = d.json().get("finalCredits") if d.content else None
        print(f"destroyed {session_id}, credits used: {final}")


if __name__ == "__main__":
    main()
