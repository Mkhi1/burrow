<p align="center">
  <img src="build/icon.png" width="96" alt="Burrow icon" />
</p>

<h1 align="center">Burrow</h1>

<p align="center">A calm, minimal terminal home for your coding agents on Windows.<br/><sub>Developed by MK</sub></p>

<p align="center">
  <a href="../../releases/latest"><b>Download for Windows</b></a>
</p>

![Burrow running Claude Code next to a terminal](docs/screenshot-main.png)

Run Claude Code, Codex, OpenCode, Gemini CLI, Kimi, Cursor Agent or a plain shell side by side, organised by project, on a blurred black glass window.

## What's new

![Two terminals working side by side, with the working marks in the sidebar](docs/screenshot-split.png)

![Dragging a session from the sidebar: the preview shows it will open on the right half](docs/screenshot-drag.png)


- **Drag to split:** drag a session from the sidebar onto the screen. A preview shows where it lands: left or right half, top or bottom, or in place of a pane. The session also stays on its own page, so closing the split pane leaves that page as it was.
- **Accurate working status:** Burrow now reads what is on each terminal's screen right now. Claude Code, Codex, Gemini and OpenCode count as working only while their "esc to interrupt" line is visible, so you see the moment they finish. Plain terminals count as working from Enter until the prompt comes back, so a quiet download still shows as running.
- **New working mark:** a 3×3 square of dots lit in a loop around its edge. It is orange for Claude Code and white for other agents, in the sidebar and in the pane title.
- **Fixes:** thin dark scrollbars everywhere (no more white bar under code blocks), a stray "nullnull" in Settings is gone, and "Developed by MK" now shows in Settings and on the welcome screen.

## Download

Grab **Burrow Setup.exe** from the [latest release](../../releases/latest) and run it.
Windows may show a SmartScreen warning because the installer isn't code-signed. Click **More info → Run anyway**.

## Features

- **Projects & sessions:** add folders, start any agent inside them, pin, rename (double-click or F2) and reorder.
- **Live status:** read from the live screen. A looping dot square while an agent works (orange for Claude Code), a pulsing dot when it needs your approval, and a check when it finishes. Native notifications are throttled so they never spam.
- **Working timer:** shows `Working… 1m 12s` in the title bar while an agent runs.
- **Splits:** up to 4 panes per page, side by side or stacked. Drag the divider to resize, double-click to reset. Drag a session from the sidebar onto the screen to split it, with a live preview of where it lands.
- **Pages:** multiple layouts, switched with the dots or `Ctrl+Alt+← / →`.
- **Token usage:** a terminal-style page that reads your Claude Code and Codex logs. It shows totals, cache hit rate, per-day bars, projects, models and top sessions.
- **Agent-to-agent messaging (MCP):** every Claude Code session gets tools to list, read, message and start other sessions.
- **Auto-detect agents:** newly installed CLIs are picked up when you return to the window, or via **Check agents**.
- **Real terminals:** ConPTY + xterm.js with WebGL rendering, links, copy/paste and resume (`--continue`) after restart.
- **Simple editor:** `Ctrl+Shift+F` opens any file as a card next to your agent. Markdown gets a live preview with clickable checkboxes; the file reloads when the agent edits it.
- **Open in Burrow:** right-click a folder or file in Explorer.
- **Auto-update:** new versions download in the background; restart when you are ready.
- **Animated themes:** Galaxy (black hole + sparkles), Shark (a glowing character-mosaic shark swimming a loop), Bloom (dot-matrix flowers), Prism (pastel ASCII sphere), Poster (blue ASCII on cream), Sky (halftone dot clouds drifting across a blue sky). Drawn in code, light on CPU (about 1–3 ms a frame, slower in the background, paused when minimized).
- **Look:** Windows 11 Acrylic/Mica blur, black and white theme, smooth motion (respects *reduce motion*).

## Token usage

A terminal-style page (`Ctrl+Shift+U`) that shows how many tokens your agents used, in plain words.

![Token usage page](docs/screenshot-usage.png)

## Shortcuts

| Action | Keys |
|---|---|
| New session | `Ctrl+Shift+N` |
| Add project | `Ctrl+Shift+O` |
| Jump to session / commands | `Ctrl+Shift+P` |
| Toggle sidebar | `Ctrl+Shift+B` |
| Split right / down | `Ctrl+Shift+D` / `Ctrl+Shift+E` |
| Close pane | `Ctrl+Shift+W` |
| Go to session 1–9 | `Ctrl+1…9` |
| Next / previous session | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Token usage | `Ctrl+Shift+U` |
| Open file (editor) | `Ctrl+Shift+F` |
| Save file / Markdown preview | `Ctrl+S` / `Ctrl+Shift+V` |
| Font size | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |
| Full screen | `F11` |
| Rename session | `F2` |
| Settings | `Ctrl+,` |

## Design

Love the look? [DESIGN.md](DESIGN.md) explains the whole style (colors, type, components, motion) with copy-paste CSS and Tailwind tokens for your own apps.

## Build from source

Requires Node.js 22+ on Windows 10/11.

```bash
git clone https://github.com/Mkhi1/burrow.git
cd burrow
npm install
npm start          # run the app
npm test           # run tests
npm run dist       # build the installer into dist/
```

## License

MIT. Developed by MK.
