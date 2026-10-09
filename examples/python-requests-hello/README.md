# python-requests-hello

## What it does

Launches a headless Ubuntu capsule, waits until it is ACTIVE, runs a command inside it,
prints the output, then destroys it in a `finally` block. Four REST calls, no SDK, one
dependency (`requests`).

It also shows the two things people get wrong on their first try: reading the `code` field
out of a failed launch instead of only the status, and destroying the capsule even when the
body of the program raises.

## Run it

```bash
pip install requests
export CAPSULATE_API_KEY="cap_live_..."   # dashboard: Settings, API and Keys
python main.py
```

Expected output:

```
launched sess-ubuntu-22.04-headless-0a1b2c3d
42
Linux 6.8.0-generic
exit code 0
destroyed sess-ubuntu-22.04-headless-0a1b2c3d, credits used: 0.1
```

## Expected time

About 1 minute end to end, most of it `pip install`. The capsule itself is alive for roughly
30 seconds: a warm launch lands in about 2 seconds, the command returns immediately, and the
destroy call is the next thing that happens.

## Expected cost

Size `1c2g` (Micro) is 0.2 credits per minute.

```
0.2 credits/minute x 0.5 minutes alive = 0.1 credits = 0.001 USD
```

The 1,000 welcome credits cover this run about 10,000 times (1,000 / 0.1). Nothing is billed
during the beta.

## What to change first

- `TEMPLATE = "ubuntu-22.04-desktop"` gives you a real desktop, and then `/screenshot` and the
  computer-use endpoints start working. On a headless capsule they answer `409`.
- `SIZE = "2c4g"` doubles the machine and the rate, to 0.4 credits per minute.
- Point `CAPSULATE_BASE_URL` at another origin if you are not on the hosted service.
