'use strict';

// Inline SVG icon set (original artwork). Stroke icons use currentColor.
window.B = window.B || {};

(() => {
  const s = (body, vb = '0 0 16 16') =>
    `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

  const icons = {
    sidebar: s('<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6.2 3v10"/>'),
    plus: s('<path d="M8 3v10M3 8h10"/>'),
    gear: s('<circle cx="8" cy="8" r="2.1"/><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6"/>'),
    folder: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 4.2c0-.8.6-1.4 1.4-1.4h3.3l1.5 1.5h5.4c.8 0 1.4.6 1.4 1.4v6.4c0 .8-.6 1.4-1.4 1.4H2.9c-.8 0-1.4-.6-1.4-1.4z"/></svg>',
    chevron: s('<path d="M6 4l4 4-4 4"/>'),
    folderOpen: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 4.2c0-.8.6-1.4 1.4-1.4h3.3l1.5 1.5h5c.8 0 1.4.6 1.4 1.4v.9H4.6c-.6 0-1.1.4-1.3.9L1.5 12z" opacity=".55"/><path d="M3.5 7.2c.2-.5.7-.9 1.3-.9h9.6c.6 0 1 .6.8 1.1l-1.7 4.8c-.2.5-.7.9-1.3.9H2.3c-.6 0-1-.6-.8-1.1z"/></svg>',
    file: s('<path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M9 1.8V5h3.5"/>'),
    eye: s('<path d="M1.8 8s2.3-4.3 6.2-4.3S14.2 8 14.2 8 11.9 12.3 8 12.3 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/>'),
    columns: s('<rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M8 3v10M4.2 6h2M4.2 8h2M9.8 6h2"/>'),
    pin: s('<path d="M9.8 2.2 13.8 6.2M11.8 4.2 8.6 7.4 5.4 6.6 4 8l4 4 1.4-1.4-.8-3.2M6 10l-3.3 3.3"/>'),
    splitRight: s('<rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M8 3v10"/>'),
    zoom: s('<path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9"/>'),
    splitDown: s('<rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M2 8h12"/>'),
    more: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/></svg>',
    close: s('<path d="M4 4l8 8M12 4l-8 8"/>'),
    min: s('<path d="M3.5 8h9"/>'),
    max: s('<path d="M5 11 11 5M6.5 5H11v4.5"/>'),
    restart: s('<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/>'),
    stop: s('<rect x="4" y="4" width="8" height="8" rx="1.5"/>'),
    trash: s('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
    edit: s('<path d="M10.5 2.8l2.7 2.7L6 12.7H3.3V10z"/>'),
    open: s('<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 10v3.5H2.5V4H6"/>'),
    page: s('<rect x="3" y="2.5" width="10" height="11" rx="1.6"/><path d="M6 6h4M6 8.5h4"/>'),
    search: s('<circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3.3 3.3"/>'),
    chart: s('<path d="M2.5 13.5h11M4.5 11V8M8 11V4M11.5 11V6.5"/>'),
    check: s('<path d="m3.5 8.5 3 3 6-7"/>'),
    // Brand mark: three stacked dots, like a little tunnel entrance.
    brand: '<svg viewBox="0 0 14 14" fill="currentColor"><circle cx="3" cy="10.5" r="1.7"/><circle cx="7" cy="6.5" r="1.7" opacity=".75"/><circle cx="3" cy="3" r="1.7" opacity=".5"/><circle cx="11" cy="10.5" r="1.7"/></svg>',
  };

  const agentIcons = {
    claude: '<svg viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1.8v12.4M1.8 8h12.4M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8"/></svg>',
    codex: s('<path d="M8 1.8 13.4 4.9v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9 8 8l5.4-3.1M8 8v6.2"/>'),
    gemini: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1c.6 3.6 3.4 6.4 7 7-3.6.6-6.4 3.4-7 7-.6-3.6-3.4-6.4-7-7 3.6-.6 6.4-3.4 7-7z"/></svg>',
    opencode: s('<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><rect x="5.5" y="5.5" width="5" height="5"/>'),
    cursor: s('<path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z"/><path d="M2.5 5 8 8.2 13.5 5M8 8.2V14"/>'),
    kimi: s('<path d="M11.8 10.6A5.5 5.5 0 1 1 6.2 2.4a4.3 4.3 0 0 0 5.6 8.2z"/>'),
    shell: s('<path d="m3 4.5 3.5 3.5L3 11.5M8 12h5"/>'),
  };

  const lightIcons = {
    close: '<svg viewBox="0 0 8 8" stroke="currentColor" stroke-width="1.2"><path d="M2 2l4 4M6 2 2 6"/></svg>',
    min: '<svg viewBox="0 0 8 8" stroke="currentColor" stroke-width="1.2"><path d="M1.5 4h5"/></svg>',
    max: '<svg viewBox="0 0 8 8" fill="currentColor"><path d="M2 2h3L2 5zM6 6H3l3-3z"/></svg>',
  };

  /** 2x3 status dot glyph; `pattern` picks which dots are lit when not busy. */
  function dots(busy) {
    const lit = [1, 0, 1, 1, 0, 1];
    return `<span class="dots${busy ? ' busy' : ''}">${lit.map((on) => `<i class="${on || busy ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  B.icons = icons;
  B.agentIcon = (id) => agentIcons[id] || agentIcons.shell;
  B.lightIcons = lightIcons;
  B.dots = dots;
})();
