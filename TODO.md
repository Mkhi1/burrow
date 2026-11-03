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

## Done

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
