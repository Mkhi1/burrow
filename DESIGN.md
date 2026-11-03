# Burrow Design Language

A complete guide to the Burrow look so you can reuse it in any app: **black glass, white type, quiet motion.**

> In one sentence: dark translucent glass in the background, solid black cards on top, white and gray text, hairline borders, and short eased animations that only move when something actually changes.

---

## 1. Principles

1. **Monochrome first.** Black, white and four grays do almost everything. Color is an exception the user chooses (folder colors, accent), never decoration.
2. **Glass behind, solid in front.** The window background is blurred and see-through (the desktop shows through). Content lives on near-black opaque cards so text stays crisp.
3. **Hairlines, not boxes.** Borders are 1px white at 8–12% opacity. Never solid gray borders.
4. **State must be obvious.** Working, needs-you, done, ready and asleep each look clearly different (shape and motion, not just color).
5. **Motion explains change.** Things fade, slide or scale only when they appear, move or change state. Nothing loops unless work is happening.
6. **Terminal soul.** Monospace for data, numbers, timers and code; system UI font for everything else.

---

## 2. Color tokens

### Core palette

| Token | Value | Use |
|---|---|---|
| `--bg-glass` | `rgba(0,0,0,0.55)` | Window background over the blur (tint 0.15–0.95, default 0.55) |
| `--bg-solid` | `#050505` | Background when blur is off |
| `--card` | `#0c0c0d` | Cards, terminal, panels |
| `--popover` | `rgba(18,18,20,0.94)` + blur | Menus, dialogs, toasts |
| `--text` | `#e6e7ea` | Primary text |
| `--text-2` | `#a9adb5` | Secondary text, icons |
| `--text-3` | `#6c717b` | Muted text, hints, inactive |
| `--white` | `#ffffff` | Emphasis: working titles, cursor, "needs you" |
| `--accent` | `#f2f2f2` | Primary buttons, bars, active toggles (user can change) |

### Overlays (always white with alpha, so they work on any dark surface)

| Token | Value | Use |
|---|---|---|
| `--line` | `rgba(255,255,255,.08)` | Default 1px borders and dividers |
| `--line-2` | `rgba(255,255,255,.12)` | Inputs, chips, selected rows, popovers |
| `--hover` | `rgba(255,255,255,.05)` | Hover background |
| `--selected` | `rgba(255,255,255,.085)` | Selected / active background |
| focus border | `rgba(255,255,255,.40)` | Focused inputs |
| active pane border | `rgba(255,255,255,.16–.18)` | Focused or working card |

### Optional colors (user-picked only)

| Name | Value |
|---|---|
| Red | `#f87171` |
| Orange | `#fb923c` |
| Yellow | `#facc15` |
| Green | `#4ade80` |
| Teal | `#2dd4bf` |
| Blue | `#60a5fa` |
| Purple | `#a78bfa` |
| Pink | `#f472b6` |
| Danger (destructive actions) | `#ff8a80` text, `#e5534b` hover background |

Accent choices offered: `#f2f2f2` (default), `#a1a1aa`, `#7bd88f`, `#5aa2ff`, `#a78bfa`, `#f472b6`.

### Terminal / code palette

| Slot | Normal | Bright |
|---|---|---|
| background | `#0c0c0d` | |
| foreground | `#d9dbe0` | |
| cursor | `#e6e7ea` (bar style, blinking) | |
| selection | `rgba(120,150,255,.28)` | |
| black | `#2a2b30` | `#6c717b` |
| red | `#ff6b6b` | `#ff8787` |
| green | `#7bd88f` | `#97e8a8` |
| yellow | `#f0b35a` | `#ffcc80` |
| blue | `#4c9dff` | `#78b6ff` |
| magenta | `#c49bff` | `#d7b8ff` |
| cyan | `#5fd0e0` | `#8ce3ee` |
| white | `#d9dbe0` | `#ffffff` |

---

## 3. Typography

| Role | Font | Size / weight |
|---|---|---|
| UI | `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif` (macOS: `-apple-system`, `"SF Pro Text"`) | 13px / 400, line-height 1.35 |
| Project / section names | UI | 13px / 600 |
| Dialog titles | UI | 14px / 600 |
| Empty-state title | UI | 15px / 600 |
| Hints, descriptions | UI | 11.5–12px / 400, `--text-3` |
| Section labels | UI | 11px / 400, UPPERCASE, letter-spacing .06–.07em, `--text-3` |
| Mono (terminal, numbers, timers, keys) | `"Cascadia Mono", "JetBrains Mono", Consolas, monospace` | 11–13px, line-height 1.22 (terminal) / 1.6 (data pages) |

Rules: use `font-variant-numeric: tabular-nums` for anything that counts. Turn on `-webkit-font-smoothing: antialiased`. Never use more than two weights on one screen.

---

## 4. Shape, spacing and depth

| Thing | Value |
|---|---|
| Base grid | 4px (spacing 4 / 6 / 8 / 12 / 14 / 16 / 18) |
| Row height | 26px (list items), 30px (group headers, buttons, chips), 32px (inputs), 37px (card header), 44px (title bar and footer) |
| Radius | 3px tiny, 5px menu items, 6–7px buttons/rows/inputs, 9px menus, 11px cards, 14px dialogs, 999px pills, 50% dots |
| Card | `background: var(--card); border: 1px solid var(--line); border-radius: 11px;` |
| Card shadow | `0 10px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.03)` |
| Menu shadow | `0 16px 48px rgba(0,0,0,.5)` |
| Dialog shadow | `0 30px 80px rgba(0,0,0,.55)` |
| Popover glass | `backdrop-filter: blur(24px) saturate(1.4)` (dialogs: 30px) |
| Gap between cards | 8px window padding, 8px dividers between split panes |
| Icons | 16×16 grid, 1.4px stroke, round caps and joins, `currentColor`; displayed at 13–16px |

---

## 5. The window

```
┌────────────────────────────────────────────────────────────┐
│ ● ● ●  ▯ ∴           │ ∴ Card title           ⧉ ⊟ ⋯        │  ← 44px bar / 37px card head
│                      │                                     │
│ ⌄ ▰ project          │   solid black card (#0c0c0d)        │
│   ◌ Session working 5s│   radius 11, hairline border       │
│   ✓ Session done     │                                     │
│ › ▰ closed   (2)     │                                     │
│                      │                                     │
│ +      ━ • •    ▥ ⚙  │                                     │  ← 44px footer
└────────────────────────────────────────────────────────────┘
   sidebar 272px (200–460, resizable) on glass   stage padding 8px
```

- **Background:** OS blur material (Windows 11 Acrylic/Mica, macOS `vibrancy`) with a black tint of 55% on top.
- **Sidebar:** sits directly on the glass, with no card.
- **Stage:** holds the cards, with 8px padding around them.
- **Window controls:** three 12px dots (red `#ff5f57`, yellow `#febc2e`, green `#28c840`) with 8px gaps. They turn into 16% white circles when the window is unfocused, and show their symbol on hover.

---

## 6. Components

### Buttons
- **Default:** 30px tall, 0 14px padding, radius 7, background `rgba(255,255,255,.07)`, 1px `--line-2` border. Hover background `.11`.
- **Primary:** background `--accent`, black text, weight 600, no border. Hover `brightness(1.08)`.
- **Icon button:** 26×26, radius 6, `--text-2`. Hover: `--hover` background and `--text` color.
- **Press:** `transform: scale(.94)` on all buttons.

### List rows (sessions)
- 26px tall, radius 7, 1px transparent border.
- **Hover:** `--hover` background.
- **Selected:** `--selected` background and `--line-2` border.
- **Visible but not focused:** a 2px white bar at 25% opacity on the left edge.
- **Layout:** status glyph (12px), title (ellipsis), optional pin, then the trailing agent icon or timer.

### Group headers (folders)
- **Arrow:** a › chevron that rotates 90° when open (200ms).
- **Icon:** open-folder icon when open, closed-folder icon when closed.
- **Closed:** name drops to `--text-2` at weight 500, and a count pill shows how many items are inside (mono 11px, pill, with an optional live dot).
- **Color:** an optional user color tints only the folder icon.

### Status states (the most important part)

| State | Glyph | Title | Trailing |
|---|---|---|---|
| **Working** | 11px ring spinner (white top, 18% ring, 0.8s) | bold white | live timer `12s` / `1m 05s` (mono) |
| **Needs you** | 7px white dot with a pulse ring | white | white pill "needs you" (black text), pulsing |
| **Done (unseen)** | ✓ check, 2px stroke | normal | agent icon |
| **Ready** | 7px hollow ring, `--text-3` | normal | agent icon |
| **Asleep** | none | `--text-3` | agent icon |

A working row also gets a slow light sweep (`linear-gradient` 7% white, 2.4s). A working **card** gets a spinner in its header, a "Working… 1m 12s" pill and a light running along its top edge. Status must hold steady: only end "working" after about 5s of quiet, never flicker.

### Pills
- **Timer pill:** mono 11.5px, padding 3px 9px, radius 999, background `.05`, `--line` border. It has a breathing 6px dot, and its text has a shimmer gradient (`--text-3` to `--text` to `--text-3`, 2.2s).
- **Count pill:** mono 11px, padding 1px 7px, background `.06`.

### Inputs
- 32px tall, radius 7, background `rgba(0,0,0,.28)`, `--line-2` border. On focus the border becomes 40% white. No glow rings.

### Chips and segmented choices
- 30px tall, radius 7, `--line-2` border, background `.04`, text `--text-2`.
- **Selected:** 45% white border, background `.08`, `--text`.

### Toggle
- Track 34×20 (white 15%, or `--accent` when on), with a 16px white knob that slides 14px.

### Menus
- Popover glass, radius 9, 5px padding, min-width 200px.
- **Items:** 28px tall, radius 5, icon (14px), label, then a right-aligned hint in `--text-3`.
- **Hover:** background `.10`, without inverting colors.
- Separators are 1px `--line` with 5px margin. Headings are 11px uppercase `--text-3`.
- Menus can include a swatch row: 18px circles, scaling to 1.15× on hover, with a white ring on the selected one.

### Dialogs
- Popover glass, radius 14, max 520px wide, appearing at 12vh from the top.
- The backdrop is black at 32%.
- **Header:** 16px 18px padding, 14px/600. **Body:** grid with 14px gaps. **Footer:** buttons aligned right.

### Toasts
- Bottom-right, popover glass, radius 8, 12px text. Shown for 2.6s, then fade out over 0.25s.

### Split dividers
- 8px hit area with an invisible 2px line. On hover or drag it becomes 45% white and grows from 36px to 64px long.
- Double-click resets the sizes. Minimum pane share is 12%.

### Data page (terminal-style report)
- Mono 12.5/1.6, `white-space: pre`.
- **Bars:** `█` plus eighth-blocks `▏▎▍▌▋▊▉` in `--accent`.
- **Rules:** `TITLE ────────`. **Options:** `[7d]`, with the active one bold white.
- Ends with a blinking block cursor `❯ ▌` (1.1s steps).

---

## 7. Motion

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | Everything that appears, moves or resizes |
| `--ease-in` | `ease-in` | Things leaving |
| fast | 110–160ms | Menus closing, presses, hovers (120–150ms) |
| base | 200–260ms | Cards in, rows sliding, chevron, page slides |
| slow loops | 0.8s spinner, 1.2–1.6s pulse/breathe, 1.6s edge light, 2.2–2.4s shimmer/sweep | Only while working |

### Recipes
- **Appear (card, dialog, menu):** opacity 0 → 1 with `scale(.985)` (cards) or `scale(.97) translateY(-3px)` (popovers), 120–220ms ease-out.
- **Disappear:** reverse, 110–160ms ease-in. Remove the element after the animation finishes, never instantly.
- **List reorder (FLIP):** record each row's top, re-render, translate by the difference, then animate to 0 over 280ms. New rows slide in from x −10px over 240ms.
- **Page change:** the stage slides 48px in the direction of travel with a fade, 260ms.
- **Content swap:** the new content fades up 4px over 220ms.
- **Text reveal (reports):** lines fade in from x −4px, staggered 14ms each (capped at 600ms).
- **Press:** `scale(.94)` on buttons and `.985` on rows.
- **Always respect reduced motion:** `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }`.

---

## 8. Voice

- **Short and plain:** "Working… 12s", "needs you", "Nothing open on this page".
- **Explain numbers in one human line:** "context reused (cheap + fast)".
- **Show keyboard shortcuts as `kbd` chips:** mono 11px, 1px `--line-2` border, radius 4.

---

## 9. Drop-in CSS

Copy this into any web, Electron or Tauri app as the starting point:

```css
:root {
  --accent: #f2f2f2;
  --tint: 0.55;
  --ui-font: "Segoe UI Variable Text", -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  --mono: "Cascadia Mono", "JetBrains Mono", Consolas, monospace;
  --text: #e6e7ea; --text-2: #a9adb5; --text-3: #6c717b;
  --line: rgba(255,255,255,.08); --line-2: rgba(255,255,255,.12);
  --hover: rgba(255,255,255,.05); --selected: rgba(255,255,255,.085);
  --card: #0c0c0d; --popover: rgba(18,18,20,.94);
  --ease-out: cubic-bezier(.2,.8,.2,1);
}
body { background: rgba(0,0,0,var(--tint)); color: var(--text); font: 13px/1.35 var(--ui-font); -webkit-font-smoothing: antialiased; }

.card { background: var(--card); border: 1px solid var(--line); border-radius: 11px;
        box-shadow: 0 10px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.03);
        animation: card-in .22s var(--ease-out); }
@keyframes card-in { from { opacity: 0; transform: scale(.985); } }

.popover { background: var(--popover); border: 1px solid var(--line-2); border-radius: 9px;
           backdrop-filter: blur(24px) saturate(1.4); box-shadow: 0 16px 48px rgba(0,0,0,.5); }

.btn { height: 30px; padding: 0 14px; border-radius: 7px; color: var(--text);
       background: rgba(255,255,255,.07); border: 1px solid var(--line-2);
       transition: background .15s, transform .12s; }
.btn:hover { background: rgba(255,255,255,.11); }
.btn:active { transform: scale(.94); }
.btn.primary { background: var(--accent); color: #000; font-weight: 600; border-color: transparent; }

.row { height: 26px; padding: 0 8px; border-radius: 7px; border: 1px solid transparent; display: flex; align-items: center; gap: 9px; transition: background .15s; }
.row:hover { background: var(--hover); }
.row.selected { background: var(--selected); border-color: var(--line-2); }

.input { height: 32px; padding: 0 10px; border-radius: 7px; background: rgba(0,0,0,.28); border: 1px solid var(--line-2); color: inherit; outline: none; }
.input:focus { border-color: rgba(255,255,255,.4); }

.spinner { width: 11px; height: 11px; border-radius: 50%; border: 1.6px solid rgba(255,255,255,.18); border-top-color: #fff; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.pill { font: 11.5px var(--mono); padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,.05); border: 1px solid var(--line); }
kbd { font: 11px var(--mono); color: var(--text-2); padding: 1px 5px; border-radius: 4px; border: 1px solid var(--line-2); background: rgba(255,255,255,.04); }

@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
```

### Tailwind (`tailwind.config.js` → `theme.extend`)

```js
colors: {
  card: '#0c0c0d', popover: 'rgba(18,18,20,.94)', accent: '#f2f2f2',
  ink: { DEFAULT: '#e6e7ea', 2: '#a9adb5', 3: '#6c717b' },
  line: { DEFAULT: 'rgba(255,255,255,.08)', 2: 'rgba(255,255,255,.12)' },
},
borderRadius: { row: '7px', menu: '9px', card: '11px', dialog: '14px' },
fontFamily: {
  ui: ['"Segoe UI Variable Text"', '-apple-system', 'system-ui', 'sans-serif'],
  mono: ['"Cascadia Mono"', '"JetBrains Mono"', 'Consolas', 'monospace'],
},
transitionTimingFunction: { out: 'cubic-bezier(.2,.8,.2,1)' },
boxShadow: {
  card: '0 10px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.03)',
  menu: '0 16px 48px rgba(0,0,0,.5)',
  dialog: '0 30px 80px rgba(0,0,0,.55)',
},
```

### Getting the blurred glass background

| Platform | How |
|---|---|
| Electron (Windows 11) | `new BrowserWindow({ titleBarStyle: 'hidden', backgroundColor: '#00000000', backgroundMaterial: 'acrylic' })` (or `'mica'`) |
| Electron (macOS) | `vibrancy: 'under-window', visualEffectState: 'active', transparent: true` |
| Tauri | `window-vibrancy` crate: `apply_acrylic` (Windows) / `apply_vibrancy` (macOS) |
| Plain web | No OS blur. Use `#050505`, or a full-page `backdrop-filter: blur(40px)` over an image |

Then set `body { background: rgba(0,0,0,.55) }` so the blur looks like dark smoked glass.

---

## 10. Checklist for a new screen

- [ ] Background is glass or `#050505`; content sits on `#0c0c0d` cards with radius 11.
- [ ] Only white, `#e6e7ea`, `#a9adb5`, `#6c717b`, plus a user-chosen accent.
- [ ] All borders are white at 8–12%.
- [ ] Numbers, timers and code are monospace with tabular numbers.
- [ ] Every state (working, needs you, done, idle) has its own shape, not just its own color.
- [ ] Appearing uses `cubic-bezier(.2,.8,.2,1)` at 120–260ms; leaving is faster and eases in.
- [ ] Reduced motion turns all animation off.
