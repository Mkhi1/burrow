'use strict';

// Photo wallpapers. Rule: a photo is never shown as a plain image. It is always turned
// into ASCII art (every cell is a character, nothing left blank), keeping the photo's own colors.
// Colors are read from the photo to pick the app accent, light or dark mode, and how dark the
// glass cards need to be, so the art never fights the text on top of it.
(() => {
  const WALLPAPERS = [
    // focus: the part of the photo kept in view when the window crops it (0..1)
    { id: 'wall-repin', name: 'Painting', src: 'wallpapers/repin-ivan.jpg', focus: { x: 0.5, y: 0.55 } },
  ];

  // Dark to bright. Starts at '.', not a space, so the whole photo is drawn.
  const RAMP = ".'`,:;-~_^\"!il|+<>ri?/\\()[]{}1tfjlxnuvczJCLYXUOQ0Zmwqpdbkhao*#MW&8%B@$";
  const FONT = 10;
  const CELL_W = 6;
  const CELL_H = 11;
  const SAMPLE_W = 480;
  const SATURATE = 1.45;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`wallpaper not found: ${src}`));
      img.src = src;
    });
  }

  function rgbToHue(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (!d) return { h: 0, s: 0, v: max / 255 };
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: d / max, v: max / 255 };
  }

  const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

  /** Read the photo once: pixels, brightness range, mean color, main hue, light or dark. */
  function analyze(img) {
    const sw = SAMPLE_W;
    const sh = Math.round((img.naturalHeight / img.naturalWidth) * sw);
    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, sw, sh);
    const data = g.getImageData(0, 0, sw, sh).data;

    const hist = new Uint32Array(256);
    const hues = new Float64Array(36);
    let sr = 0, sg = 0, sb = 0;
    const n = sw * sh;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], gg = data[i + 1], b = data[i + 2];
      sr += r; sg += gg; sb += b;
      hist[Math.round(lum(r, gg, b) * 255)]++;
      const { h, s, v } = rgbToHue(r, gg, b);
      hues[Math.floor(h / 10) % 36] += s * s * v; // vivid, bright pixels count most
    }
    const pct = (p) => {
      let acc = 0;
      for (let i = 0; i < 256; i++) if ((acc += hist[i]) >= n * p) return i / 255;
      return 1;
    };
    const mean = { r: sr / n, g: sg / n, b: sb / n };
    const meanL = lum(mean.r, mean.g, mean.b);
    // main hue: the strongest 30° window
    let best = 0, bestW = -1;
    for (let i = 0; i < 36; i++) {
      const w = hues[(i + 35) % 36] + hues[i] + hues[(i + 1) % 36];
      if (w > bestW) { bestW = w; best = i; }
    }
    const light = meanL > 0.55;
    const hue = best * 10 + 5;
    const meanHue = rgbToHue(mean.r, mean.g, mean.b);
    return {
      data, sw, sh,
      lo: pct(0.02),
      hi: Math.max(pct(0.98), pct(0.02) + 0.05),
      light,
      // accent stays readable with the black text the app puts on primary buttons
      accent: light ? hsl(hue, 0.6, 0.38) : hsl(hue, 0.62, 0.7),
      backdrop: light ? hsl(meanHue.h, 0.25, 0.94) : hsl(meanHue.h, 0.35, 0.03),
      // darker veil for busy/bright photos so code on top stays easy to read
      card: light ? 'rgba(8, 8, 10, 0.86)' : `rgba(6, 5, 5, ${clamp(0.6 + meanL * 0.6, 0.62, 0.84).toFixed(2)})`,
    };
  }

  /** Recolor a cell so it keeps its hue but never gets too bright (dark mode) or too pale (light mode). */
  function balance(r, g, b, t, light) {
    // thin glyph strokes look greyer than the photo, so give the color back a little
    const gray = (r + g + b) / 3;
    r = gray + (r - gray) * SATURATE;
    g = gray + (g - gray) * SATURATE;
    b = gray + (b - gray) * SATURATE;
    const L = Math.max(lum(Math.max(r, 0), Math.max(g, 0), Math.max(b, 0)), 0.01);
    const target = light ? 0.12 + 0.45 * (1 - t) : 0.2 + 0.66 * t;
    const k = target / L;
    return `rgb(${clamp(Math.round(r * k), 0, 255)},${clamp(Math.round(g * k), 0, 255)},${clamp(Math.round(b * k), 0, 255)})`;
  }

  /** Draw the whole photo as colored characters onto an offscreen canvas the size of the window. */
  function render(info, wp, w, h) {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const off = document.createElement('canvas');
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    const g = off.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = info.backdrop;
    g.fillRect(0, 0, w, h);
    g.font = `600 ${FONT}px "Cascadia Mono", Consolas, monospace`;
    g.textBaseline = 'top';

    // cover the window, keeping the focus point in view
    const { sw, sh, data, lo, hi, light } = info;
    const scale = Math.max(w / sw, h / sh);
    const ox = clamp(w / 2 - wp.focus.x * sw * scale, w - sw * scale, 0);
    const oy = clamp(h / 2 - wp.focus.y * sh * scale, h - sh * scale, 0);
    const cols = Math.ceil(w / CELL_W);
    const rows = Math.ceil(h / CELL_H);
    const last = RAMP.length - 1;
    const range = hi - lo;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // average the photo pixels under this cell
        const x0 = clamp(Math.floor((col * CELL_W - ox) / scale), 0, sw - 1);
        const y0 = clamp(Math.floor((row * CELL_H - oy) / scale), 0, sh - 1);
        const x1 = clamp(Math.ceil(((col + 1) * CELL_W - ox) / scale), x0 + 1, sw);
        const y1 = clamp(Math.ceil(((row + 1) * CELL_H - oy) / scale), y0 + 1, sh);
        let r = 0, gg = 0, b = 0, k = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * sw + x) * 4;
            r += data[i]; gg += data[i + 1]; b += data[i + 2]; k++;
          }
        }
        r /= k; gg /= k; b /= k;
        // lift the shadows so dark parts of the photo keep their color and shape
        const t = Math.pow(clamp((lum(r, gg, b) - lo) / range, 0, 1), 0.85);
        // light mode: dark ink on paper, so dense characters go where the photo is dark
        const idx = Math.round((light ? 1 - t : t) * last);
        g.fillStyle = balance(r, gg, b, t, light);
        g.fillText(RAMP[idx], col * CELL_W, row * CELL_H);
      }
    }
    return off;
  }

  function applyLook(info) {
    const s = document.body.style;
    s.setProperty('--wall-accent', info.accent);
    s.setProperty('--wall-card', info.card);
    document.body.classList.toggle('scene-light', info.light);
  }

  for (const wp of WALLPAPERS) {
    let info = null;
    const ready = loadImage(wp.src)
      .then((img) => { info = analyze(img); })
      .catch((err) => console.warn('[wallpaper]', err.message));

    B.scenes.register(wp.id, {
      name: wp.name,
      fps: 2, // still art; redrawing a cached canvas is cheap
      get light() { return Boolean(info?.light); },
      make() {
        let art = null;
        let size = [0, 0];
        const build = () => {
          if (!info) return;
          art = render(info, wp, size[0], size[1]);
          if (B.scenes.current() === wp.id) applyLook(info);
        };
        ready.then(() => {
          build();
          if (B.scenes.current() === wp.id) B.scenes.drawAt(0);
        });
        return {
          init(w, h) {
            size = [w, h];
            build();
          },
          frame(g, _t, _dt, w, h) {
            if (art) return g.drawImage(art, 0, 0, w, h);
            g.fillStyle = '#000'; // still loading, or the file is missing
            g.fillRect(0, 0, w, h);
          },
        };
      },
    });
  }
})();
