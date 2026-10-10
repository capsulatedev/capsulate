# claude-code-live-handoff

## What it does

Claude Code works on a real desktop in the cloud while you watch it live in your browser. It
launches an Ubuntu desktop capsule, gives you a live link, says what it is doing at every step,
writes a short plan in a text editor, and then hands you the screen for the one thing it should
not decide alone: your choice. When you press **Done, hand back**, it reads what you chose,
finishes the plan, saves it, lets go of the screen, and cleans up when you say so.

There is no code to write. This folder holds a project `.mcp.json` and this README. The same
handoff is how a sign in works: the AI never types your password, you do, on the live screen.

## What you need

- Claude Code.
- Node.js 18 or newer, for `npx`.
- A Capsulate API key: dashboard, Settings, API and Keys.
- Any browser to watch in. The live link needs no login.

## 1. Put the key in your environment, never in the chat

Anything you type into the chat goes to the model and stays in the transcript, so the key never
goes there. Set it in the terminal you start Claude Code from. These lines read it without
showing it or saving it in your shell history:

```bash
read -rs CAPSULATE_API_KEY && export CAPSULATE_API_KEY   # bash or zsh: paste the key, press Enter
```

```powershell
$env:CAPSULATE_API_KEY = Read-Host -MaskInput "Capsulate API key"   # PowerShell 7
```

The variable lasts as long as that terminal, so start `claude` from it. Claude Code passes the key
to the Capsulate MCP server it starts on your computer, and the server sends it only to the
Capsulate API. The model never sees it.

## 2. Add the server to Claude Code

Pick one of the two.

**With `claude mcp add`**, for you only:

```bash
claude mcp add capsulate -e 'CAPSULATE_API_KEY=${CAPSULATE_API_KEY}' -- npx -y @capsulate/mcp@0.4
```

Keep the single quotes. They store the reference `${CAPSULATE_API_KEY}`, not the key, and Claude
Code fills it in from your environment each time it starts the server. The same line works in
bash, zsh and PowerShell. Add `-s user` to have the server in every project.

**With a project `.mcp.json`**, to share with a team. It holds no key, so it is safe to commit:
copy `.mcp.json` from this folder into the root of your project, or start Claude Code in this
folder. Each person sets their own `CAPSULATE_API_KEY`. The first time, Claude Code asks whether
to use the servers in the project's `.mcp.json`: approve `capsulate`.

Both pin the server to the 0.4 line of `@capsulate/mcp`, the release whose tools this README
names. `CAPSULATE_BASE_URL` is optional; the `.mcp.json` falls back to `https://api.capsulate.dev`.

## 3. Check it

```bash
claude mcp list
```

`capsulate` should show as connected. Inside Claude Code, `/mcp` lists it with its tools.

Claude Code asks before it uses each tool for the first time. To allow every Capsulate tool for
one session, start it with `claude --allowedTools "mcp__capsulate__*"`. These tools act on your
capsules in the cloud, not on your computer.

## 4. Paste this prompt

```text
Use the Capsulate tools. I want to watch you work on a live screen.

1. Launch an ubuntu-22.04-desktop capsule at size 2c4g.
2. Make a control console link with capsulate_console_link and give me the URL. Set the
   pace to natural with capsulate_control. Then stop and wait until I say "go".
3. From then on, narrate each step with capsulate_say, in one short sentence.
4. Open Mousepad with capsulate_open and wait for its window.
5. Write a plan with capsulate_element set_value (role "text", window "Mousepad"): the
   title "Saturday plan", three numbered ideas for a Saturday in a city, and a last line
   "Chosen: ". Check that it shows with capsulate_wait_for.
6. Hand me the screen with capsulate_handoff. Ask me to type the number of the idea I like
   after "Chosen:" and press "Done, hand back".
7. When I hand back, read the editor's text with capsulate_find_element (role "text",
   window "Mousepad"). Add a last line "First step: ..." for the idea I chose, with
   set_value again.
8. Save it as /home/capsulate/saturday-plan.txt in one capsulate_run_actions call: ctrl+s,
   wait for the "Save As" window, set its text field to that path, invoke its "Save"
   button. Then check the file with capsulate_read_file.
9. Thank me with capsulate_say and release the screen with capsulate_control action
   "release".
10. Tell me which idea I chose, and ask me before you destroy the capsule.

Never type a password or any other secret yourself: hand me the screen instead.
```

The AI replies with the link and waits. Open the link, then type `go`.

## What you see

In Claude Code, each tool call as it happens, and the link in the AI's reply. Click it, or copy it
into any browser.

In the browser, the capsule's desktop, live, with a bar at the top:

- **The AI is driving**, with the AI's latest narration line under it. The AI's pointer, clicks and
  keys are drawn over the screen. Your mouse and keyboard do nothing while the AI holds the screen,
  so a stray click cannot fight it. **Natural pace** means the pointer glides and typing is
  readable.
- **Take over** gives you the screen at any time. The AI's clicks and keys are refused while you
  hold it; it waits, and carries on after you hand back.
- The activity button at the end of the bar lists every action and narration line.
- **The AI needs you**: the AI has handed you the screen, and its note says what it needs.
- **The screen is free**: nobody holds it, and you and the AI can both act.

Treat the link like a password: anyone who has it can watch and take the screen until it expires
(4 hours by default) or the capsule is destroyed. It is also in your Claude Code transcript.

## At the handoff

1. Read the note in the bar.
2. Click at the end of the line `Chosen:` in the editor and type the number of the idea you like.
3. Optional: write a note for the AI in the box next to the button. The AI gets it back.
4. Press **Done, hand back** (on a phone, **Done**).

While you hold the screen the AI can still look at it, but it cannot click or type. The handoff
waits 5 minutes by default; if you need longer, the AI keeps waiting with
`capsulate_wait_for_handback`. A sign in works the same way: sign in yourself, then hand back.

## What the AI does, tool by tool

| Step | Tool |
| --- | --- |
| Launch the desktop | `capsulate_launch` |
| Make the live link | `capsulate_console_link` |
| Slow down so you can follow | `capsulate_control`, action `pace` |
| One line of narration per step | `capsulate_say` |
| Open the editor by name | `capsulate_open` |
| Write the plan by element, no coordinates | `capsulate_element`, action `set_value` |
| Check that the text shows | `capsulate_wait_for` |
| Hand you the screen and wait | `capsulate_handoff`, and `capsulate_wait_for_handback` if you need longer |
| Read your choice | `capsulate_find_element` |
| Save through the dialog in one call | `capsulate_run_actions` |
| Check the saved file | `capsulate_read_file` |
| Let go of the screen | `capsulate_control`, action `release` |
| Clean up | `capsulate_destroy` |

When a step does not go as planned, it looks with `capsulate_screenshot` or `capsulate_ui_tree`,
and moves or closes windows with `capsulate_window`.

## Expected time

About 5 minutes to set up, most of it making the key. The run takes about 5 minutes: the launch
takes a few seconds, the AI works for 2 to 3 minutes (each tool call is one model turn of a few
seconds, and the natural pace adds a little), and the rest is you opening the link and choosing.

## Expected cost

Size `2c4g` (Standard) is 0.4 credits per minute, and the capsule is alive for about 5 minutes:

```
0.4 credits/minute x 5 minutes alive = 2 credits = 0.02 USD
```

The capsule runs until it is destroyed. If you walk away during the handoff, it keeps running while
the AI waits: press Esc in Claude Code and ask it to destroy the capsule. A free account's capsule
ends after 60 minutes at most, so the worst case is:

```
0.4 credits/minute x 60 minutes alive = 24 credits = 0.24 USD
```

Your Claude plan or API account pays for the model's tokens. Capsulate does not meter tool calls:
clicks, keys, screenshots and narration are free, and you pay for the machine's time. Nothing is
billed during the beta.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Claude Code reports "Missing environment variables: CAPSULATE_API_KEY", or the tools answer `401` | Set the key in the terminal you start Claude Code from (step 1), then start `claude` again from it. A revoked key also answers `401`: make a new one. |
| On native Windows, `claude mcp list` says the server failed | Put `cmd /c` before `npx`: `-- cmd /c npx -y @capsulate/mcp@0.4`, or in `.mcp.json` `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@capsulate/mcp@0.4"]`. |
| The launch answers `403` with code `policy_denied` | A free account runs one capsule at a time. Clean up with `npx @capsulate/cli capsule list` and `npx @capsulate/cli capsule destroy <id>`. |
| The link says it does not work | It expired, or the capsule is gone. Ask the AI for a new link. |
| The picture stops moving | Browsers pause a tab you are not looking at. Bring the tab to the front. |
| The AI says a person holds the screen | You pressed **Take over**. Press **Hand back**. |

## What to change first

- **A sign in instead of a choice.** Replace steps 4 to 10 with: "Open https://github.com/login
  with capsulate_browser_open, then hand me the screen with capsulate_handoff so I can sign in.
  When I hand back, tell me which account is signed in, release the screen, and ask me before you
  destroy the capsule." You type the password on the live screen, not in the chat, and the AI
  carries on with the session you opened.
- **Windows**, for invited testers: ask for `windows-server-2022-desktop` and Notepad. Notepad's
  text area is the role `document`, its Save As name field is the `edit` named `File name:`, and
  the home folder is `C:\Users\capsulate`. Windows is an evaluation build and is not billed.
- **Watch only.** Ask for a `view` link to share with people who should not take the screen.
- **Faster.** Leave the pace out of step 2: the default is fast, at machine speed.
