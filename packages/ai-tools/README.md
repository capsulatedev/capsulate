# @capsulate/ai-tools

Drop-in sandbox tools for AI agent frameworks. Give your agent a real machine: launch an
isolated cloud capsule, run code, read and write files, drive a desktop through the OS
accessibility tree, checkpoint before a risky step and roll back. Built on
[`@capsulate/sdk`](../sdk). One tool set, adapters for every framework.

```bash
npm install @capsulate/ai-tools @capsulate/sdk zod
```

Set `CAPSULATE_API_KEY` (dashboard: Settings, API and Keys).

## Vercel AI SDK (v5)

The returned record plugs straight into `tools`. Each tool carries its input schema under
both names the AI SDK has used, `inputSchema` (v5) and `parameters` (v4), so the same call
works on either major.

```ts
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { capsulateTools } from "@capsulate/ai-tools";

const tools = capsulateTools({ apiKey: process.env.CAPSULATE_API_KEY });

const { text } = await generateText({
  model: openai("gpt-4o"),
  prompt: "Launch an ubuntu-22.04-headless capsule at size 1c2g, run `python3 -c 'print(2**10)'`, tell me the output, then destroy it.",
  tools,
  stopWhen: stepCountIs(8),
});
```

On AI SDK v4, replace `stopWhen: stepCountIs(8)` with `maxSteps: 8`. Nothing else changes.
`ai` is an optional peer dependency of this package; install the version your project uses.

## Computer use (a desktop capsule)

Screenshots and computer-use need a desktop template (`ubuntu-22.04-desktop`, or
`windows-server-2022-desktop` for invited testers). A headless capsule answers `409` to a
screenshot request.

```ts
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { capsulateTools } from "@capsulate/ai-tools";

const tools = capsulateTools({ apiKey: process.env.CAPSULATE_API_KEY });

const { text } = await generateText({
  model: openai("gpt-4o"),
  prompt: [
    "Launch an ubuntu-22.04-desktop capsule at size 1c2g.",
    "Take a checkpoint. Read the UI tree, open the text editor from the applications menu",
    "by clicking the element by name, type 'hello from an agent', then read the screen with OCR",
    "and tell me what you see. Finish with the action trace, then destroy the capsule.",
  ].join(" "),
  tools,
  stopWhen: stepCountIs(20),
});
console.log(text);
```

The agent uses `capsulate_ui_tree` and `capsulate_find_element` to see real controls (role,
name, on-screen bounds, a click-ready center), `capsulate_click_element` to act on one by
name instead of by pixel, `capsulate_wait_element` to verify the screen changed, and
`capsulate_get_trace` to hand back every action in order.

## LangChain (JS)

```ts
import { DynamicStructuredTool } from "@langchain/core/tools";
import { capsulateLangChainSpecs } from "@capsulate/ai-tools";

const tools = capsulateLangChainSpecs({ apiKey: process.env.CAPSULATE_API_KEY })
  .map((s) => new DynamicStructuredTool(s));
// pass `tools` to your agent, createReactAgent or AgentExecutor
```

## LlamaIndex.TS (or any TS framework)

Use the generic specs: `{ name, description, parameters, inputSchema, execute }`.

```ts
import { capsulateToolSpecs } from "@capsulate/ai-tools";
import { FunctionTool } from "llamaindex";

const tools = capsulateToolSpecs({ apiKey: process.env.CAPSULATE_API_KEY }).map((s) =>
  FunctionTool.from(s.execute, { name: s.name, description: s.description, parameters: s.parameters }),
);
```

## Python (LlamaIndex, CrewAI, LangChain)

There is no Python SDK yet, but the API is one HTTP call. A full runnable version is in
[`examples/python-requests-hello`](../../examples/python-requests-hello).

```python
import os, requests
API = "https://api.capsulate.dev/api/v1"
H = {"Authorization": f"Bearer {os.environ['CAPSULATE_API_KEY']}"}

def run_in_sandbox(code: str) -> str:
    cap = requests.post(f"{API}/sessions", headers=H,
        json={"templateId": "ubuntu-22.04-headless", "size": "1c2g"}).json()
    sid = cap["sessionId"]
    try:
        out = requests.post(f"{API}/sessions/{sid}/exec",
            headers=H, json={"cmd": ["python3", "-c", code]}).json()
        return out.get("stdout", "")
    finally:
        requests.delete(f"{API}/sessions/{sid}", headers=H)

# CrewAI:     from crewai_tools import tool;  @tool("Run code in a sandbox") def t(code): return run_in_sandbox(code)
# LlamaIndex: from llama_index.core.tools import FunctionTool; FunctionTool.from_defaults(fn=run_in_sandbox)
```

## Tools provided (23)

| Tool | What it does |
| --- | --- |
| `capsulate_launch_capsule` | Launch a capsule from a template and wait until it is ready; returns the `sessionId` |
| `capsulate_run_code` | Run a python, node or bash snippet; returns stdout, stderr and the exit code |
| `capsulate_exec` | Run a command given as an argv array |
| `capsulate_write_file` | Write a UTF-8 text file inside the capsule |
| `capsulate_read_file` | Read a UTF-8 text file from the capsule |
| `capsulate_screenshot` | Screenshot of a desktop capsule as base64 PNG with width and height |
| `capsulate_ui_tree` | The desktop's accessibility tree: real elements with role, name, value, bounds and states |
| `capsulate_find_element` | Find elements by role, name, text or state; each match has a click-ready center |
| `capsulate_click_element` | Find an element by role, name or text and click its center (optionally wait for it first) |
| `capsulate_type_text` | Type literal text into the focused field |
| `capsulate_press_keys` | Press a key or chord, for example `["ctrl", "c"]` or `["Return"]` |
| `capsulate_wait_element` | Wait until a matching element appears or the timeout passes |
| `capsulate_ocr` | Recognize on-screen text, full screen or a region |
| `capsulate_clipboard` | Read the desktop clipboard, or set it when `text` is given |
| `capsulate_checkpoint` | Snapshot the capsule's disk before a risky action; returns a `checkpointId` |
| `capsulate_rollback` | Restore a checkpoint into a fresh capsule and return its new `sessionId` |
| `capsulate_get_trace` | The structured action trace for the run, every interaction in order |
| `capsulate_console_link` | A signed, expiring URL that opens a desktop capsule's live screen in any browser, no login |
| `capsulate_say` | One line of narration on the live console |
| `capsulate_handoff` | Hand the screen to the person watching with a note; waits for the hand back and returns their note |
| `capsulate_control` | Who drives the screen (free, agent, human); take or release it |
| `capsulate_destroy_capsule` | Destroy a capsule and release its resources |
| `capsulate_list_capsules` | List the team's active capsules |

Launches default to size `2c4g` when the model does not pass a size; pass `size: "1c2g"`
in the prompt or in your own wrapper for the smallest machine. Rollback returns a new
`sessionId` because the restored machine is a fresh capsule; on the free tier (one capsule
at a time) destroy the current capsule first, or launch from the checkpoint with the SDK
(`capsules.launch({ snapshot: checkpointId, ... })`).
