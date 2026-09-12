# "Open in Capsulate" badge

A one-click badge that drops a visitor into a live, interactive capsule for your project —
no install, no sign-up. It's powered by a **Path B demo link** (Phase 10b): you create a
demo link for your project's environment once, then point the badge at it.

## 1. Create a demo link

In the dashboard → **Demo links → New demo link**, pick a desktop or headless template
(pre-load your tools via a bundle/template), and copy the link id (`demo-…`). Or via the CLI:

```bash
cap demo create "Try MyProject" -t ubuntu-22.04-desktop --record
# → Share: https://app.capsulate.dev/demo/demo-xxxx
```

## 2. Add the badge to your README

Shields.io (no asset to host):

```markdown
[![Open in Capsulate](https://img.shields.io/badge/Open%20in-Capsulate-7c3aed?style=for-the-badge)](https://app.capsulate.dev/demo/demo-xxxx)
```

Or the brand badge bundled here (`integrations/open-in-capsulate/badge.svg`):

```markdown
[![Open in Capsulate](https://capsulate.dev/badge.svg)](https://app.capsulate.dev/demo/demo-xxxx)
```

Renders as a button that opens your live demo:

> [**▶ Open in Capsulate**](https://app.capsulate.dev/demo/demo-xxxx)

## 3. (Optional) Embed it directly in a page

```html
<iframe src="https://app.capsulate.dev/embed/demo/demo-xxxx"
        width="100%" height="600"
        style="border:1px solid #e5e7eb;border-radius:12px"
        allow="clipboard-read; clipboard-write; fullscreen"></iframe>
```

Each visitor gets their own ephemeral capsule (billed to your team, cleaned up on exit), and
you see the analytics + replays in the **Demo links** dashboard.

> A deeper "open *this commit* in Capsulate" deep-link (auto-clone the current repo/ref) is a
> planned enhancement; today the badge targets a demo link you control.
