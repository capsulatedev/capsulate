# @capsulate/ai-tools

Drop-in **sandbox tools** for AI agent frameworks. Give your agent the ability to launch
an isolated cloud capsule, run code, read/write files, and tear it down — built on
[`@capsulate/sdk`](../sdk). One tool set, adapters for every framework.

```bash
npm install @capsulate/ai-tools @capsulate/sdk
```

Set `CAPSULATE_API_KEY` (from the dashboard → Settings → API & Keys).

## Vercel AI SDK

The returned record plugs straight into `tools`:

```ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { capsulateTools } from "@capsulate/ai-tools";

const tools = capsulateTools({ apiKey: process.env.CAPSULATE_API_KEY });

const { text } = await generateText({
  model: openai("gpt-4o"),
  prompt: "Launch an ubuntu-22.04-headless capsule, run `python3 -c 'print(2**10)'`, tell me the output, then destroy it.",
  tools,
  maxSteps: 8,
});
```

## LangChain (JS)

```ts
import { DynamicStructuredTool } from "@langchain/core/tools";
import { capsulateLangChainSpecs } from "@capsulate/ai-tools";

const tools = capsulateLangChainSpecs({ apiKey: process.env.CAPSULATE_API_KEY })
  .map((s) => new DynamicStructuredTool(s));
// pass `tools` to your agent / createReactAgent / AgentExecutor
```

## LlamaIndex.TS (or any TS framework)

Use the generic specs — `{ name, description, parameters (zod), execute }`:

```ts
import { capsulateToolSpecs } from "@capsulate/ai-tools";
import { FunctionTool } from "llamaindex";

const tools = capsulateToolSpecs({ apiKey: process.env.CAPSULATE_API_KEY }).map((s) =>
  FunctionTool.from(s.execute, { name: s.name, description: s.description, parameters: s.parameters }),
);
```

## Python (LlamaIndex / CrewAI / LangChain-Python)

There's no Python SDK yet, but the API is one HTTP call. Example CrewAI tool:

```python
import os, requests
API = "https://api.capsulate.dev/api/v1"
H = {"Authorization": f"Bearer {os.environ['CAPSULATE_API_KEY']}"}

def run_in_sandbox(code: str) -> str:
    cap = requests.post(f"{API}/sessions",
        headers=H, json={"templateId": "ubuntu-22.04-headless", "size": "2c4g"}).json()
    sid = cap["sessionId"]
    try:
        out = requests.post(f"{API}/sessions/{sid}/exec",
            headers=H, json={"cmd": ["python3", "-c", code]}).json()
        return out.get("stdout", "")
    finally:
        requests.delete(f"{API}/sessions/{sid}", headers=H)

# CrewAI:   from crewai_tools import tool;  @tool("Run code in a sandbox") def t(code): return run_in_sandbox(code)
# LlamaIndex: from llama_index.core.tools import FunctionTool; FunctionTool.from_defaults(fn=run_in_sandbox)
```

## Tools provided

`capsulate_launch_capsule`, `capsulate_run_code`, `capsulate_exec`, `capsulate_write_file`,
`capsulate_read_file`, `capsulate_destroy_capsule`, `capsulate_list_capsules`.
