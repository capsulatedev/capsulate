// An agent with a real machine. The Vercel AI SDK runs the loop, @capsulate/ai-tools
// gives the model the tools to launch a capsule, run code in it, read and write files,
// and destroy it when it is done.
//
//   npm install
//   export CAPSULATE_API_KEY="cap_live_..."
//   export OPENAI_API_KEY="sk-..."
//   npm start
//
// AI SDK v5 stops the loop with `stopWhen: stepCountIs(n)`. On v4 the same call is
// `maxSteps: n`; the tools themselves need no change, because each one carries its
// schema under both names (`inputSchema` for v5, `parameters` for v4).

import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { capsulateTools } from "@capsulate/ai-tools";

const apiKey = process.env.CAPSULATE_API_KEY;
if (!apiKey) {
  console.error("Set CAPSULATE_API_KEY first (dashboard: Settings, API and Keys).");
  process.exit(1);
}

const tools = capsulateTools({ apiKey });

const { text, steps } = await generateText({
  model: openai("gpt-4o"),
  tools,
  stopWhen: stepCountIs(8),
  prompt: [
    "You have a sandbox with real machines. Do this, one tool call at a time:",
    "1. Launch a capsule from template ubuntu-22.04-headless at size 1c2g.",
    "2. Write a file /root/primes.py that prints the first 20 prime numbers.",
    "3. Run it with python3 and read the output.",
    "4. Destroy the capsule.",
    "Then tell me the primes it printed and nothing else.",
  ].join("\n"),
});

console.log(`\n${steps.length} steps, ${steps.flatMap((s) => s.toolCalls).length} tool calls`);
for (const step of steps) {
  for (const call of step.toolCalls) console.log(`  called ${call.toolName}`);
}
console.log(`\n${text}`);
