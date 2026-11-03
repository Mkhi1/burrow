'use strict';

// Animated backgrounds, drawn in code on one canvas behind the app.
// Kept light: ~24 fps when focused (60 for scenes that need it), 8 fps in the background, paused when hidden,
// a single frame when "reduce motion" is on.
(() => {
  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  let reduce = false;
  const TAU = Math.PI * 2;

  let W = 0;
  let H = 0;
  let scene = null;
  let raf = 0;
  let last = 0;
  let t = 0;
  let sceneFps = 24;

  // ---------- small helpers ----------

  function mulberry32(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /** Pre-render glyphs once (chars × colors) so each frame only copies pixels. */
  function makeAtlas(chars, colors, size) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = Math.ceil(size * 0.7) + 2;
    const ch = size + 4;
    const c = document.createElement('canvas');
    c.width = chars.length * cw * dpr;
    c.height = colors.length * ch * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.font = `${size}px "Cascadia Mono", Consolas, monospace`;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    colors.forEach((col, ci) => {
      g.fillStyle = col;
      [...chars].forEach((chr, i) => g.fillText(chr, i * cw + cw / 2, ci * ch + ch / 2));
    });
    return {
      count: chars.length,
      draw(target, charIndex, colorIndex, x, y) {
        target.drawImage(c, charIndex * cw * dpr, colorIndex * ch * dpr, cw * dpr, ch * dpr, x - cw / 2, y - ch / 2, cw, ch);
      },
    };
  }

  function sparkle(g, x, y, size, alpha) {
    if (alpha <= 0.01) return;
    g.globalAlpha = alpha;
    const glow = g.createRadialGradient(x, y, 0, x, y, size * 0.7);
    glow.addColorStop(0, 'rgba(255,255,255,0.85)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(x - size * 0.7, y - size * 0.7, size * 1.4, size * 1.4);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(x - size, y); g.lineTo(x, y - 1.1); g.lineTo(x + size, y); g.lineTo(x, y + 1.1);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(x, y - size * 1.35); g.lineTo(x + 1.1, y); g.lineTo(x, y + size * 1.35); g.lineTo(x - 1.1, y);
    g.closePath(); g.fill();
    g.globalAlpha = 1;
  }

  // ---------- Galaxy: a black hole with a spinning dot-matrix disk ----------

  function galaxy() {
    const rnd = mulberry32(7);
    let stars = [];
    let sparks = [];
    let disk = [];
    let ring = [];
    let jet = [];
    let G = null;
    const TILT = -0.42;
    const cosT = Math.cos(TILT);
    const sinT = Math.sin(TILT);

    const newSpark = (w, h, first) => {
      const life = 5 + rnd() * 5;
      return { x: w * 0.25 + rnd() * w * 0.75, y: rnd() * h, size: 8 + rnd() * 14, life, age: first ? rnd() * life : -rnd() * 3 };
    };

    return {
      init(w, h) {
        const R = Math.min(w, h) * 0.38;
        G = { R, cx: w * 0.6, cy: h * 0.52, hole: R * 0.2 };
        stars = Array.from({ length: Math.round((w * h) / 5200) }, () => ({ x: rnd() * w, y: rnd() * h, p: rnd() * TAU, sp: 0.6 + rnd() * 2.2, z: rnd() < 0.85 ? 1 : 2 }));
        sparks = Array.from({ length: 9 }, () => newSpark(w, h, true));
        disk = Array.from({ length: 1600 }, () => {
          const r = R * (0.26 + 0.74 * Math.pow(rnd(), 0.85));
          return { r, a: rnd() * TAU, b: 0.55 + rnd() * 0.45, j: (rnd() - 0.5) * R * 0.05 };
        });
        ring = Array.from({ length: 70 }, (_, i) => ({ a: (i / 70) * TAU, b: 0.4 + rnd() * 0.6 }));
        jet = Array.from({ length: 46 }, () => ({ s: rnd(), side: rnd() < 0.5 ? -1 : 1, b: 0.4 + rnd() * 0.6 }));
      },
      frame(g, time, dt, w, h) {
        g.fillStyle = '#000';
        g.fillRect(0, 0, w, h);
        // distant stars: twinkle and drift
        g.fillStyle = '#fff';
        for (const s of stars) {
          s.x -= dt * 2.5 * s.z;
          if (s.x < -2) s.x = w + 2;
          g.globalAlpha = 0.15 + 0.6 * (0.5 + 0.5 * Math.sin(time * s.sp + s.p));
          g.fillRect(s.x, s.y, s.z, s.z);
        }
        const { R, cx, cy, hole } = G;
        const project = (r, a, j) => {
          const px = r * Math.cos(a);
          const py = r * Math.sin(a) * 0.3 + j;
          return [Math.round((cx + px * cosT - py * sinT) / 5) * 5, Math.round((cy + px * sinT + py * cosT) / 5) * 5];
        };
        const drawDisk = (front) => {
          for (const d of disk) {
            if (front !== Math.sin(d.a) > 0) continue;
            const [x, y] = project(d.r, d.a, d.j);
            const inner = Math.pow((R * 0.26) / d.r, 0.7);
            const doppler = 0.65 + 0.35 * Math.cos(d.a + 0.6);
            const a = Math.min(1, d.b * (0.65 + 1.1 * inner) * doppler * (front ? 1.25 : 0.75));
            g.globalAlpha = a;
            const sz = a > 0.7 ? 3.8 : 3;
            g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
          }
        };
        for (const d of disk) d.a += dt * 0.16 * Math.pow((R * 0.26) / d.r, 1.5) * 3;
        // soft light around the hole so the galaxy reads clearly
        g.globalCompositeOperation = 'lighter';
        const halo = g.createRadialGradient(cx, cy, hole * 0.8, cx, cy, R * 1.1);
        halo.addColorStop(0, 'rgba(200,215,255,0.22)');
        halo.addColorStop(0.4, 'rgba(140,160,255,0.08)');
        halo.addColorStop(1, 'rgba(120,140,255,0)');
        g.fillStyle = halo;
        g.fillRect(cx - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#fff';
        drawDisk(false);
        // the hole and its glowing photon ring
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.beginPath();
        g.arc(cx, cy, hole, 0, TAU);
        g.fill();
        g.fillStyle = '#fff';
        for (const p of ring) {
          const a = p.a + time * 0.35;
          const x = cx + Math.cos(a) * hole * 1.12;
          const y = cy + Math.sin(a) * hole * 1.12;
          g.globalAlpha = p.b * (0.45 + 0.55 * Math.sin(time * 2 + p.a * 3) ** 2);
          g.fillRect(Math.round(x / 3) * 3 - 1.2, Math.round(y / 3) * 3 - 1.2, 2.4, 2.4);
        }
        drawDisk(true);
        // jets streaming out of the poles
        const jx = -sinT;
        const jy = cosT;
        for (const p of jet) {
          p.s += dt * 0.07;
          if (p.s > 1) p.s -= 1;
          const dist = hole * 1.3 + p.s * R * 1.15;
          g.globalAlpha = p.b * (1 - p.s) * 0.7;
          g.fillRect(Math.round((cx + jx * dist * p.side) / 4) * 4 - 1.3, Math.round((cy + jy * dist * p.side) / 4) * 4 - 1.3, 2.6, 2.6);
        }
        // four-point sparkles that bloom and fade
        for (let i = 0; i < sparks.length; i++) {
          const s = sparks[i];
          s.age += dt;
          if (s.age > s.life) sparks[i] = newSpark(w, h);
          if (s.age > 0) sparkle(g, s.x, s.y, s.size * (0.8 + 0.2 * Math.sin(time * 3 + i)), Math.sin((Math.PI * s.age) / s.life) ** 2);
        }
        g.globalAlpha = 1;
      },
    };
  }

  // ---------- Shark: a glowing character-mosaic shark swimming a smooth loop ----------

  function shark() {
    const rnd = mulberry32(3);
    const CHARS = '0SX8@%91X58';
    const COLORS = ['#ffffff', '#cfe6ff', '#7fb6ff', '#3f7fe0', '#ff9b6a'];
    const atlases = new Map();
    let bg = null;
    let bubbles = [];
    let motes = [];
    let sharks = [];

    const atlasFor = (cell) => {
      if (!atlases.has(cell)) atlases.set(cell, makeAtlas(CHARS, COLORS, Math.max(6, cell - 1)));
      return atlases.get(cell);
    };
    const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    // Body half-width (share of length) along the spine: round head, fins, forked tail.
    function width(s) {
      let wd = s < 0.14 ? 0.1 * Math.sqrt(s / 0.14) : 0.1 - (s - 0.14) * 0.11;
      wd = Math.max(wd, 0.018);
      wd += Math.max(0, 1 - Math.abs(s - 0.34) / 0.09) * 0.11;
      if (s > 0.86) wd += (s - 0.86) * 0.75;
      return wd;
    }

    function makeShark(w, h, depth) {
      const L = Math.min(w, h) * 0.4 * depth;
      const heading = rnd() * TAU;
      const x = w * (0.4 + rnd() * 0.45);
      const y = h * (0.25 + rnd() * 0.5);
      // Start with a straight body trailing behind the head.
      const trail = [];
      for (let d = 0; d <= L + 20; d += 3) trail.push({ x: x - Math.cos(heading) * d, y: y - Math.sin(heading) * d });
      return {
        depth, L, x, y, heading, trail,
        turn: 0,
        cell: Math.max(6, Math.round(11 * depth)),
        speed: (62 + rnd() * 22) * (0.5 + 0.5 * depth),
        seed: rnd() * 100,
      };
    }

    /** Smooth wandering: gentle turns from layered slow waves, steering back when near an edge. */
    function steer(s, time, dt, w, h) {
      const wander = Math.sin(time * 0.31 + s.seed) * 0.6 + Math.sin(time * 0.13 + s.seed * 2.3) * 0.4;
      let desired = wander * 0.5;
      const margin = Math.min(w, h) * 0.2;
      // Stay in the open water to the right of the sidebar.
      const left = Math.min(w * 0.3, 300);
      const push = Math.max(0, (left + margin - s.x) / margin, (s.x - (w - margin)) / margin, (margin - s.y) / margin, (s.y - (h - margin)) / margin);
      if (push > 0) {
        const toCenter = Math.atan2(h / 2 - s.y, w * 0.62 - s.x);
        desired += wrapAngle(toCenter - s.heading) * 1.8 * Math.min(1, push);
      }
      s.turn += (desired - s.turn) * Math.min(1, dt * 1.2);
      s.heading += s.turn * dt;
      const sp = s.speed * (0.85 + 0.15 * Math.sin(time * 0.6 + s.seed));
      s.x += Math.cos(s.heading) * sp * dt;
      s.y += Math.sin(s.heading) * sp * dt;
      s.sp = sp;
      // The body follows the exact path the head swam.
      s.trail.unshift({ x: s.x, y: s.y });
      let len = 0;
      for (let i = 1; i < s.trail.length; i++) {
        len += Math.hypot(s.trail[i].x - s.trail[i - 1].x, s.trail[i].y - s.trail[i - 1].y);
        if (len > s.L + 20) {
          s.trail.length = i + 1;
          break;
        }
      }
    }

    function drawShark(g, s, time) {
      const { L, cell, trail, depth } = s;
      const atlas = atlasFor(cell);
      const fade = 0.4 + 0.6 * depth;
      // Walk along the trail once, sampling the spine at even distances.
      const spine = [];
      let acc = 0;
      let i = 1;
      for (let d = 0; d <= L; d += cell * 0.8) {
        while (i < trail.length - 1) {
          const seg = Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
          if (acc + seg >= d) break;
          acc += seg;
          i++;
        }
        const a = trail[i - 1];
        const b = trail[Math.min(i, trail.length - 1)];
        const seg = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const f = Math.min(1, Math.max(0, (d - acc) / seg));
        spine.push({ d, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, tx: a.x - b.x, ty: a.y - b.y });
      }
      const mid = spine[Math.floor(spine.length * 0.35)] || spine[0];
      g.globalCompositeOperation = 'lighter';
      const glow = g.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, L * 0.8);
      glow.addColorStop(0, `rgba(120,190,255,${0.32 * fade})`);
      glow.addColorStop(0.5, `rgba(60,120,230,${0.1 * fade})`);
      glow.addColorStop(1, 'rgba(40,90,200,0)');
      g.fillStyle = glow;
      g.fillRect(mid.x - L, mid.y - L, L * 2, L * 2);
      g.globalCompositeOperation = 'source-over';

      const seen = new Set();
      const tick = Math.floor(time * 6);
      const beat = time * 4.5 * (s.sp / 70);
      for (const p of spine) {
        const t01 = p.d / L;
        const len = Math.hypot(p.tx, p.ty) || 1;
        const nx = -p.ty / len;
        const ny = p.tx / len;
        const sway = L * 0.07 * t01 ** 1.6 * Math.sin(beat - t01 * 5.5);
        const half = width(t01) * L;
        for (let k = -half; k <= half; k += cell * 0.8) {
          if (t01 > 0.9 && Math.abs(k) < half * 0.45) continue; // forked tail
          const x = Math.round((p.x + nx * (k + sway)) / cell) * cell;
          const y = Math.round((p.y + ny * (k + sway)) / cell) * cell;
          const key = x * 10007 + y;
          if (seen.has(key)) continue;
          seen.add(key);
          const edge = Math.abs(k) / (half || 1);
          const v = clamp01((1 - edge * edge) * (1 - t01 * 0.55) + 0.08);
          g.globalAlpha = v * 0.8 * fade;
          g.fillStyle = v > 0.75 ? '#e8f2ff' : v > 0.45 ? '#7fb0f5' : '#2f66c8';
          g.fillRect(x - cell / 2, y - cell / 2, cell - 1, cell - 1);
          const r = hash(x + tick, y);
          if (r < 0.62 && cell >= 7) {
            g.globalAlpha = (0.55 + 0.45 * v) * fade;
            const color = r < 0.04 ? 4 : v > 0.75 ? 0 : v > 0.45 ? 1 : v > 0.25 ? 2 : 3;
            atlas.draw(g, Math.floor(r * 1000) % atlas.count, color, x, y);
          }
        }
      }
      g.globalAlpha = 1;
    }

    return {
      init(w, h) {
        bg = document.createElement('canvas');
        bg.width = w;
        bg.height = h;
        const b = bg.getContext('2d');
        const grad = b.createRadialGradient(w * 0.6, h * 0.45, 0, w * 0.6, h * 0.45, Math.max(w, h) * 0.8);
        grad.addColorStop(0, '#0a2a4a');
        grad.addColorStop(0.55, '#05182e');
        grad.addColorStop(1, '#01060c');
        b.fillStyle = grad;
        b.fillRect(0, 0, w, h);
        for (let y = 6; y < h; y += 14) {
          for (let x = 6; x < w; x += 14) {
            const v = rnd();
            b.fillStyle = v < 0.5 ? 'rgba(80,160,140,0.10)' : v < 0.8 ? 'rgba(70,110,200,0.10)' : 'rgba(200,90,80,0.07)';
            b.fillRect(x, y, 1.5, 1.5);
          }
        }
        // Far, middle and near sharks for depth (drawn far → near).
        sharks = [0.45, 0.62, 0.8, 1].map((d) => makeShark(w, h, d));
        bubbles = Array.from({ length: 34 }, () => ({ x: rnd() * w, y: rnd() * h, r: 0.8 + rnd() * 2.2, sp: 10 + rnd() * 24, p: rnd() * TAU }));
        motes = Array.from({ length: 70 }, () => ({ x: rnd() * w, y: rnd() * h, vx: (rnd() - 0.5) * 6, vy: (rnd() - 0.5) * 4, p: rnd() * TAU }));
      },
      frame(g, time, dt, w, h) {
        g.drawImage(bg, 0, 0);
        // drifting light shafts
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const x = w * (0.25 + 0.3 * i) + Math.sin(time * 0.17 + i * 2) * w * 0.14;
          const y = h * 0.3 + Math.cos(time * 0.13 + i) * h * 0.22;
          const rr = Math.max(w, h) * 0.32;
          const lg = g.createRadialGradient(x, y, 0, x, y, rr);
          lg.addColorStop(0, 'rgba(40,110,200,0.08)');
          lg.addColorStop(1, 'rgba(40,110,200,0)');
          g.fillStyle = lg;
          g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
        g.globalCompositeOperation = 'source-over';
        // floating plankton
        g.fillStyle = '#8fc4ff';
        for (const m of motes) {
          m.x = (m.x + m.vx * dt + w) % w;
          m.y = (m.y + m.vy * dt + h) % h;
          g.globalAlpha = 0.12 + 0.25 * (0.5 + 0.5 * Math.sin(time * 1.3 + m.p));
          g.fillRect(m.x, m.y, 1.6, 1.6);
        }
        g.globalAlpha = 1;
        for (const s of sharks) {
          steer(s, time, dt, w, h);
          drawShark(g, s, time);
        }
        // bubbles rising
        g.fillStyle = '#9fd0ff';
        for (const b of bubbles) {
          b.y -= dt * b.sp;
          if (b.y < -5) {
            b.y = h + 5;
            b.x = Math.random() * w;
          }
          g.globalAlpha = 0.28;
          g.beginPath();
          g.arc(b.x + Math.sin(time + b.p) * 6, b.y, b.r, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
      },
    };
  }

  // ---------- Bloom: dot-matrix flowers that slowly turn ----------

  function bloom() {
    const rnd = mulberry32(11);
    const CELL = 7;
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
    let flowers = [];
    let dust = [];
    let words = [];

    return {
      init(w, h) {
        const m = Math.min(w, h);
        const specs = [
          { x: 0.42, y: 0.42, r: 0.34, k: 5, sp: 0.035 },
          { x: 0.78, y: 0.66, r: 0.27, k: 6, sp: -0.045 },
          { x: 0.2, y: 0.82, r: 0.2, k: 5, sp: 0.05 },
        ];
        flowers = specs.map((f, i) => {
          const cx = f.x * w;
          const cy = f.y * h;
          const R = f.r * m;
          const cells = [];
          for (let y = Math.max(0, cy - R); y < Math.min(h, cy + R); y += CELL) {
            for (let x = Math.max(0, cx - R); x < Math.min(w, cx + R); x += CELL) {
              const gx = Math.round(x / CELL);
              const gy = Math.round(y / CELL);
              const px = gx * CELL - cx;
              const py = gy * CELL - cy;
              const rho = Math.hypot(px, py);
              if (rho > R) continue;
              cells.push({ x: gx * CELL, y: gy * CELL, rho: rho / R, th: Math.atan2(py, px), th2: BAYER[(gx & 3) + (gy & 3) * 4] });
            }
          }
          return { ...f, i, cells };
        });
        dust = Array.from({ length: 110 }, () => ({ x: rnd() * w, y: rnd() * h, p: rnd() * TAU, s: 0.4 + rnd() }));
        const texts = ['STAY', 'CURIOUS', 'BUILD', 'QUIETLY'];
        const spots = [[0.42, 0.1], [0.36, 0.32], [0.8, 0.36], [0.7, 0.9]];
        words = texts.map((txt, i) => ({ txt, x: spots[i][0] * w, y: spots[i][1] * h, p: i * 1.6 }));
      },
      frame(g, time, dt, w, h) {
        g.fillStyle = '#000';
        g.fillRect(0, 0, w, h);
        for (const f of flowers) {
          const rot = time * f.sp + f.i;
          const breathe = 1 + 0.04 * Math.sin(time * 0.6 + f.i * 2);
          for (const c of f.cells) {
            const petal = Math.sqrt(Math.abs(Math.cos((f.k * (c.th - rot)) / 2)));
            const edge = (0.3 + 0.7 * petal) * breathe;
            if (c.rho > edge) continue;
            const v = 1 - (c.rho / edge) * 0.75 + 0.12 * Math.cos(f.k * (c.th - rot) * 2);
            if (c.th2 > v * 0.92) continue;
            const indigo = Math.sin((c.th - rot) * 2 + time * 0.3 + f.i) > 0.55;
            g.fillStyle = indigo ? '#5a5ef2' : '#e9e9ee';
            g.globalAlpha = indigo ? 0.85 : 0.55 + 0.4 * v;
            g.fillRect(c.x, c.y, 2.6, 2.6);
          }
        }
        g.fillStyle = '#fff';
        for (const d of dust) {
          d.y -= dt * 4 * d.s;
          if (d.y < 0) d.y = h;
          g.globalAlpha = 0.15 + 0.5 * (0.5 + 0.5 * Math.sin(time * d.s * 2 + d.p));
          g.fillRect(Math.round(d.x / CELL) * CELL, Math.round(d.y / CELL) * CELL, 2.4, 2.4);
        }
        g.font = '17px "Cascadia Mono", Consolas, monospace';
        g.textAlign = 'center';
        g.letterSpacing = '4px';
        for (const wd of words) {
          const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 0.5 + wd.p));
          const y = wd.y + Math.sin(time * 0.4 + wd.p) * 4;
          g.globalAlpha = a;
          g.fillStyle = '#f2f2f6';
          g.fillText(wd.txt, wd.x, y);
          g.strokeStyle = '#5a5ef2';
          g.lineWidth = 1.4;
          g.strokeRect(wd.x - 7, y + 14, 13, 13);
        }
        g.letterSpacing = '0px';
        g.globalAlpha = 1;
      },
    };
  }

  // ---------- Prism: a pastel ASCII sphere that pulses ----------

  function prism() {
    const CELL = 15;
    const RAMP = ' .:-=+*#%@';
    const HUES = 12;
    let atlas = null;
    let cells = [];
    let S = 200;
    let cx = 0;
    let cy = 0;

    return {
      init(w, h) {
        S = Math.min(w, h) * 0.4;
        cx = w * 0.58;
        cy = h * 0.5;
        const colors = Array.from({ length: HUES }, (_, i) => `hsl(${(i * 360) / HUES}, 70%, 80%)`);
        atlas = makeAtlas(RAMP, colors, 13);
        cells = [];
        for (let y = cy - S; y <= cy + S; y += CELL) {
          for (let x = cx - S * 1.15; x <= cx + S * 1.15; x += CELL * 0.66) {
            const nx = (x - cx) / S;
            const ny = (y - cy) / S;
            if (Math.abs(nx) * 0.85 + Math.abs(ny) > 1.05) continue;
            cells.push({ x, y, nx, ny, d: Math.abs(nx) * 0.85 + Math.abs(ny), ang: Math.atan2(ny, nx) });
          }
        }
      },
      frame(g, time, dt, w, h) {
        g.fillStyle = '#0a0a0b';
        g.fillRect(0, 0, w, h);
        const lx = Math.cos(time * 0.45);
        const ly = Math.sin(time * 0.45) * 0.6;
        for (const c of cells) {
          const core = 1 - c.d;
          const z = Math.sqrt(Math.max(0, 1 - c.nx * c.nx - c.ny * c.ny));
          const shade = Math.max(0, c.nx * lx + c.ny * ly + z * 0.7);
          const wave = 0.5 + 0.5 * Math.sin(c.d * 11 - time * 2.4);
          const band = Math.exp(-((c.ny * 5) ** 2)) * (1 - Math.abs(c.nx) * 0.6);
          let v = core * (0.55 + shade * 0.35) + wave * 0.22 * (core + 0.15) + band * 0.45;
          v = clamp01(v);
          if (v < 0.1) continue;
          const ci = Math.min(RAMP.length - 1, Math.floor(v * RAMP.length));
          if (ci === 0) continue;
          const hue = Math.floor(((((c.ang / TAU) * 360 + time * 22 + c.d * 90) % 360) + 360) % 360 / (360 / HUES)) % HUES;
          g.globalAlpha = 0.45 + 0.55 * v;
          atlas.draw(g, ci, hue, c.x, c.y);
        }
        g.globalAlpha = 1;
      },
    };
  }

  // ---------- Poster: flowing blue ASCII on cream paper ----------

  function poster() {
    const rnd = mulberry32(5);
    const CELL = 11;
    const CHARS = '@MZJ/rad#c';
    let atlas = null;
    let paper = null;
    let blocks = [];

    return {
      init(w, h) {
        atlas = makeAtlas(CHARS, ['#1f5fbf', '#2f7be0', '#e0245e'], 11);
        paper = document.createElement('canvas');
        paper.width = w;
        paper.height = h;
        const p = paper.getContext('2d');
        p.fillStyle = '#f3eee2';
        p.fillRect(0, 0, w, h);
        for (let i = 0; i < (w * h) / 900; i++) {
          p.fillStyle = `rgba(120,100,70,${rnd() * 0.05})`;
          p.fillRect(rnd() * w, rnd() * h, 1, 1);
        }
        const corners = [[w - 140, 8], [w - 120, h - 120], [8, h - 150]];
        blocks = corners.flatMap(([bx, by]) => Array.from({ length: 40 }, () => ({ x: bx + Math.floor(rnd() * 11) * 11, y: by + Math.floor(rnd() * 11) * 11, p: rnd() * TAU, s: 0.5 + rnd() * 2 })));
      },
      frame(g, time, dt, w, h) {
        g.drawImage(paper, 0, 0);
        const cols = Math.ceil(w / CELL);
        const rows = Math.ceil(h / CELL);
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const x = i * CELL;
            const y = j * CELL;
            const f = Math.sin(x * 0.011 + time * 0.35) + Math.sin(y * 0.016 - time * 0.27) + Math.sin((x + y) * 0.008 + time * 0.22);
            const band = Math.abs(f - 0.6);
            const band2 = Math.abs(f + 1.1);
            if (band > 0.16 && band2 > 0.1) continue;
            const v = 1 - Math.min(band / 0.16, band2 / 0.1);
            g.globalAlpha = 0.45 + 0.55 * v;
            atlas.draw(g, Math.floor(hash(i, j) * CHARS.length), v > 0.6 ? 0 : 1, x + CELL / 2, y + CELL / 2);
          }
        }
        g.fillStyle = '#2f66c8';
        for (const b of blocks) {
          const on = Math.sin(time * b.s + b.p);
          if (on < 0.2) continue;
          g.globalAlpha = on;
          g.fillRect(b.x, b.y, 9, 9);
        }
        g.globalAlpha = 0.9 + 0.1 * Math.sin(time);
        g.fillStyle = '#e0245e';
        g.font = '600 64px "Segoe UI Variable Display", "Segoe UI", sans-serif';
        g.textAlign = 'left';
        const y = h - 150 + Math.sin(time * 0.5) * 4;
        g.fillText('BURROW', w - 330, y);
        g.font = '28px "Segoe UI Variable Display", "Segoe UI", sans-serif';
        g.fillText('agents at home', w - 326, y + 38);
        g.globalAlpha = 1;
      },
    };
  }

  // ---------- Sky: halftone dot clouds drifting across a blue sky ----------

  function sky() {
    const rnd = mulberry32(21);
    const perm = new Uint8Array(512);
    const base = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [base[i], base[j]] = [base[j], base[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
    const lattice = (i, j) => perm[(perm[i & 255] + j) & 255] / 255;
    const smooth = (v) => v * v * (3 - 2 * v);
    function noise(x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const u = smooth(x - xi);
      const v = smooth(y - yi);
      const a = lattice(xi, yi);
      const b = lattice(xi + 1, yi);
      const c = lattice(xi, yi + 1);
      const d = lattice(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    const fbm = (x, y) => noise(x, y) * 0.63 + noise(x * 2.1, y * 2.1) * 0.37;

    const CELL = 15;
    const SIZES = 9;
    let bg = null;
    let dots = null;
    let birds = [];

    return {
      init(w, h) {
        bg = document.createElement('canvas');
        bg.width = w;
        bg.height = h;
        const b = bg.getContext('2d');
        const grad = b.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0b56b0');
        grad.addColorStop(0.6, '#2c80d6');
        grad.addColorStop(1, '#5aa6ea');
        b.fillStyle = grad;
        b.fillRect(0, 0, w, h);
        // Round dot sprites in a few sizes, drawn once.
        dots = document.createElement('canvas');
        dots.width = SIZES * CELL;
        dots.height = CELL;
        const d = dots.getContext('2d');
        d.fillStyle = '#fff';
        for (let i = 1; i <= SIZES; i++) {
          d.beginPath();
          d.arc((i - 1) * CELL + CELL / 2, CELL / 2, (i / SIZES) * CELL * 0.48, 0, TAU);
          d.fill();
        }
        birds = Array.from({ length: 4 }, (_, i) => ({ x: rnd() * w, y: h * (0.12 + rnd() * 0.35), sp: 30 + rnd() * 25, p: rnd() * TAU, s: 0.7 + rnd() * 0.6, delay: i * 4 }));
      },
      frame(g, time, dt, w, h) {
        g.drawImage(bg, 0, 0);
        const drift = time * 0.035;
        for (let row = 0, y = CELL / 2; y < h + CELL; row++, y += CELL) {
          const offset = row % 2 ? CELL / 2 : 0;
          const ny = y * 0.0052;
          const heightBias = 1 - Math.abs(y / h - 0.45) * 0.9;
          for (let x = offset; x < w + CELL; x += CELL) {
            const n = fbm(x * 0.0036 + drift, ny + Math.sin(time * 0.05) * 0.2) * heightBias;
            const cloud = Math.max(0, Math.min(1, (n - 0.36) / 0.3));
            const haze = n > 0.28 ? 0.12 : 0;
            const v = Math.max(cloud, haze);
            if (v <= 0.02) continue;
            const size = Math.max(1, Math.min(SIZES, Math.round(v * SIZES)));
            g.globalAlpha = 0.35 + 0.65 * v;
            g.drawImage(dots, (size - 1) * CELL, 0, CELL, CELL, x - CELL / 2, y - CELL / 2, CELL, CELL);
          }
        }
        // a few birds gliding across, wings flapping
        g.globalAlpha = 0.75;
        g.strokeStyle = '#0a2f60';
        g.lineWidth = 1.6;
        for (const bd of birds) {
          bd.x += dt * bd.sp;
          if (bd.x > w + 40) {
            bd.x = -40;
            bd.y = h * (0.1 + Math.random() * 0.35);
          }
          const flap = Math.sin(time * 7 + bd.p) * 5 * bd.s;
          const y = bd.y + Math.sin(time * 0.8 + bd.p) * 6;
          g.beginPath();
          g.moveTo(bd.x - 9 * bd.s, y - flap);
          g.quadraticCurveTo(bd.x - 4 * bd.s, y - 2, bd.x, y);
          g.quadraticCurveTo(bd.x + 4 * bd.s, y - 2, bd.x + 9 * bd.s, y - flap);
          g.stroke();
        }
        g.globalAlpha = 1;
      },
    };
  }

  // ---------- engine ----------

  const SCENES = {
    galaxy: { name: 'Galaxy', make: galaxy, light: false },
    shark: { name: 'Shark', make: shark, light: false },
    bloom: { name: 'Bloom', make: bloom, light: false },
    prism: { name: 'Prism', make: prism, light: false },
    poster: { name: 'Poster', make: poster, light: true },
    sky: { name: 'Sky', make: sky, light: false },
  };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth;
    H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene?.init(W, H);
  }

  let resizeTimer = 0;
  addEventListener('resize', () => {
    if (!scene) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      if (reduce) scene.frame(ctx, 3, 0, W, H);
    }, 120);
  });

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const fps = document.hasFocus() ? sceneFps : 8;
    if (now - last < 1000 / fps - 3) return;
    const dt = Math.min((now - last) / 1000, 0.12);
    last = now;
    t += dt;
    scene.frame(ctx, t, dt, W, H);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (!scene) return; // the browser pauses frames by itself while hidden
    last = performance.now();
    if (reduce) scene.frame(ctx, 3, 0, W, H);
    else raf = requestAnimationFrame(loop);
  }

  let currentId = 'none';
  function set(id) {
    if (id === currentId) return;
    currentId = id;
    cancelAnimationFrame(raf);
    const def = SCENES[id];
    scene = def ? def.make() : null;
    sceneFps = def?.fps || 24;
    document.body.dataset.scene = def ? id : '';
    document.body.classList.toggle('has-scene', Boolean(def));
    document.body.classList.toggle('scene-light', Boolean(def?.light));
    canvas.style.display = def ? 'block' : 'none';
    if (!def) return;
    t = 0;
    resize();
    start();
  }

  document.addEventListener('visibilitychange', () => (document.hidden ? cancelAnimationFrame(raf) : start()));

  B.scenes = {
    set,
    drawAt(time) {
      if (scene) scene.frame(ctx, time, 0, W, H);
    },
    setReduce(on) {
      if (reduce === on) return;
      reduce = on;
      start();
    },
    /** Average ms to draw one frame (for checking the cost of a theme). */
    bench(n = 60) {
      if (!scene) return 0;
      const t0 = performance.now();
      for (let i = 0; i < n; i++) scene.frame(ctx, t + i / 24, 1 / 24, W, H);
      return (performance.now() - t0) / n;
    },
    list: () => [{ id: 'none', name: 'Glass' }, ...Object.entries(SCENES).map(([id, s]) => ({ id, name: s.name }))],
  };
})();
