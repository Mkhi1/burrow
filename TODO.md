# Burrow roadmap

## Next

- [ ] **Agent teams (link sessions)**: right-click a session → Link with… → pick a mode
  - Handoff (A → B): when A finishes, Burrow sends A's result to B with your instruction
  - Review loop (A ⇄ B): build → review → fix, until "approved" or the round limit (default 3)
  - Ask freely: give Codex / OpenCode / Gemini the same MCP tools Claude has
  - Link line in the sidebar, "round 2/3" in the card, pause button; never auto-approves prompts
- [ ] **Send files to agents**: drag a file onto a card, or right-click → Send to Burrow → pick a session, and it types `@path` into the prompt
- [ ] **Approve from the sidebar**: when an agent asks "Do you want to…?", show Yes / No buttons on the card and in the notification

## Ideas

- [ ] Git branch + changed-file count on each session row
- [ ] One worktree per session, so two agents can work on the same repo without clashing
- [ ] Search across all sessions' output
- [ ] Prompt library: saved prompts / snippets you can send to any agent
- [ ] Broadcast: send one message to several agents at once
- [ ] Phone remote: watch and reply to sessions from your phone (local network, QR code to pair)
- [ ] Token usage per Burrow session, shown in the card header
- [ ] Export a session transcript as Markdown
- [ ] Themes: import/export, light theme
- [ ] Scheduled tasks: run an agent prompt every morning
- [ ] Code signing (removes the SmartScreen warning)
- [ ] macOS and Linux builds

### Layouts & panes
- [ ] Saved layouts: name a layout ("review setup") and restore it in one click, with the same sessions in the same places
- [ ] Keyboard pane moves: `Ctrl+Alt+Arrow` moves focus between panes, `Ctrl+Alt+Shift+Arrow` moves the pane itself
- [ ] Pop out a pane into its own window (for a second monitor), and drag it back in
- [ ] Drag a pane onto a page dot to send it to that page
- [ ] Undo the last layout change (`Ctrl+Z` on the stage)
- [ ] Tabs inside a pane: stack several sessions in one slot and switch with tabs

### Agents
- [ ] Session timeline: a thin strip under each card showing when it worked, waited for you and finished today
- [ ] "Done" summary: when an agent finishes, show its last message as a one-line preview on the sidebar row
- [ ] Cost guard: warn (or pause) when one session passes a token budget you set
- [ ] Quick prompt bar: `Ctrl+Space` opens a small box that sends text to the focused agent without leaving what you're doing
- [ ] Restart with context: one click restarts a crashed agent with `--continue`
- [ ] Per-project defaults: which agent, model and startup command a folder opens with
- [ ] Session templates: "Claude + test runner + git log" opens three panes at once

### Terminal
- [ ] Find in terminal (`Ctrl+F`) with highlight
- [ ] Click a file path in the output to open it in the editor at that line
- [ ] Sticky command header: the last command you ran stays pinned at the top of the card while output scrolls
- [ ] Copy last output: one button copies just the output of the last command

### Look & feel
- [ ] Birds theme (see below)
- [ ] More photo wallpapers as ASCII art (Painting rule), and drop your own picture to turn it into a theme
- [ ] Theme reacts to work: the background speeds up or glows softly while an agent is working
- [ ] Focus mode: hide the sidebar and every pane except the one you're typing in
- [ ] Sound pack (optional, off by default): a soft tone when an agent finishes or needs you
- [ ] Custom accent per project, used for its folder, working mark and card edge

### Sharing
- [ ] Record a clip of a session (like the README film) straight from the app
- [ ] Share a session as a read-only link on your local network
- [ ] Settings sync: export / import all settings, projects and themes as one file

## Done

- [x] Mixed split layouts: side-by-side + stacked, move, swap, zoom, smooth glide (0.3.5)
- [x] Drag a session from the sidebar to split, with a drop preview (0.3.3)
- [x] Working status read from the live screen, dot-square working mark, orange for Claude (0.3.3)
- [x] Painting theme: a photo drawn as colored ASCII, app colors from the picture (0.3.6)
- [x] README film recorded from the real app, theme gallery, X post kit

- [x] Simple editor: Ctrl+Shift+F to open a file, Markdown preview (Edit / Both / Preview), clickable checkboxes, live reload, Ctrl+S
- [x] Auto-update from GitHub releases (download in background, restart when you choose)
- [x] Right-click "Open in Burrow" for folders and files
- [x] Projects, sessions, pins, rename, pages, resizable splits
- [x] Clear working / needs-you / done states, working timer
- [x] Folder open/closed states and folder colors
- [x] Auto-detect the agent running in a terminal
- [x] Token usage page
- [x] Agent-to-agent messaging (MCP)
- [x] Throttled notifications with mute
- [x] DESIGN.md style guide

## Later: Birds theme
- Draft saved in `drafts/birds-theme.js` (murmuration + swallows + soft clouds, 60 fps).
- Still to do: make it lighter (~1 ms per frame), refine the flock shape and bird detail.
