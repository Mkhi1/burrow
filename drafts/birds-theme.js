// Birds theme draft (paused). Paste this function into src/renderer/js/scenes.js before the engine section,
// then add  birds: { name: 'Birds', make: birds, light: false, fps: 60 },  to SCENES.
// Status: murmuration (boids) + passing swallows + soft clouds; ~2.6 ms/frame at 520 birds, needs optimizing.

  // ---------- Birds: a murmuration and passing swallows over soft night clouds ----------

  function birds() {
    const rnd = mulberry32(31);
    // Smooth, never-repeating wander: sines with unrelated frequencies.
    const wander = (x, s) => (Math.sin(x + s) + Math.sin(x * 1.618 + s * 2.3) * 0.6 + Math.sin(x * 2.718 + s * 3.7) * 0.3) / 1.9;
    let bg = null;
    let layers = [];
    let flock = [];
    let swallows = [];
    let grid = new Map();
    const CELL = 40;
    const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    // ----- clouds: wide, soft banks built from radial-gradient puffs (no hard edges) -----
    function cloudLayer(w, h, banks, yMin, yMax, size, alpha) {
      const cw = w * 2;
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = h;
      const g = c.getContext('2d');
      const puff = (x, y, r, a) => {
        for (const shift of [0, cw, -cw]) {
          const gr = g.createRadialGradient(x + shift, y, 0, x + shift, y, r);
          gr.addColorStop(0, `rgba(255,255,255,${a})`);
          gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`);
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(x + shift - r, y - r, r * 2, r * 2);
        }
      };
      g.setTransform(1, 0, 0, 0.42, 0, 0); // squash puffs into wide, flat cloud shapes
      for (let i = 0; i < banks; i++) {
        const x = rnd() * cw;
        const y = (h * (yMin + rnd() * (yMax - yMin))) / 0.42;
        const r = size * (0.7 + rnd() * 0.6);
        for (let k = 0; k < 16; k++) {
          const px = x + (rnd() - 0.5) * r * 3.2;
          const py = y + (rnd() - 0.5) * r * 0.9 - Math.max(0, 1 - Math.abs(px - x) / (r * 1.6)) * r * 0.35;
          puff(px, py, r * (0.35 + rnd() * 0.55), alpha * (0.5 + rnd() * 0.5));
        }
      }
      return { c, cw };
    }

    function drawLayer(g, L, time, w) {
      const off = ((time * L.speed) % L.cw + L.cw) % L.cw;
      g.drawImage(L.c, -off, 0);
      if (L.cw - off < w) g.drawImage(L.c, L.cw - off, 0);
    }

    // ----- one bird as a thin, smooth silhouette added to the shared path -----
    // fx forward, fy sideways (units of s); span 0..1 is how open the wings are in the beat.
    function addBird(p, x, y, c, sn, s, span, fork) {
      const sp = 0.28 + 0.72 * span;
      const tipX = -0.18 - 0.22 * (1 - span);
      const tail = fork ? 0.78 : 0.42;
      const f = 0.14 * fork;
      // local (forward, side) → screen, inlined for speed
      const cs = c * s;
      const ss = sn * s;
      const px = (a, b) => x + a * cs - b * ss;
      const py = (a, b) => y + a * ss + b * cs;
      p.moveTo(px(0.5, 0), py(0.5, 0));
      p.lineTo(px(0.12, 0.07), py(0.12, 0.07));
      p.quadraticCurveTo(px(0.16, 0.62 * sp), py(0.16, 0.62 * sp), px(tipX, sp), py(tipX, sp));
      p.quadraticCurveTo(px(-0.1, 0.42 * sp), py(-0.1, 0.42 * sp), px(-0.2, 0.06), py(-0.2, 0.06));
      p.lineTo(px(-tail, f), py(-tail, f));
      p.lineTo(px(-0.5, 0), py(-0.5, 0));
      p.lineTo(px(-tail, -f), py(-tail, -f));
      p.lineTo(px(-0.2, -0.06), py(-0.2, -0.06));
      p.quadraticCurveTo(px(-0.1, -0.42 * sp), py(-0.1, -0.42 * sp), px(tipX, -sp), py(tipX, -sp));
      p.quadraticCurveTo(px(0.16, -0.62 * sp), py(0.16, -0.62 * sp), px(0.12, -0.07), py(0.12, -0.07));
      p.closePath();
    }

    // ----- the murmuration: boids with a roaming target and ripple waves -----
    function target(time, w, h, k) {
      return {
        x: w * (0.5 + 0.36 * wander(time * 0.045, 1.3 + k * 4)),
        y: h * (0.44 + 0.2 * wander(time * 0.06, 7.1 + k * 3)),
      };
    }

    function makeFlock(w, h, n) {
      const a = target(0, w, h, 0);
      return Array.from({ length: n }, (_, i) => {
        const ang = rnd() * TAU;
        const r = Math.sqrt(rnd()) * Math.min(w, h) * 0.16;
        const head = 0.4 + (rnd() - 0.5) * 0.4;
        return {
          x: a.x + Math.cos(ang) * r * 1.8, y: a.y + Math.sin(ang) * r * 0.7,
          vx: Math.cos(head) * 110, vy: Math.sin(head) * 110,
          h: head, wave: 0, s: 3.2 + rnd() * 2.6, phase: rnd() * TAU, rate: 5 + rnd() * 3, j: rnd() * 100,
          group: i % 3 === 0 ? 1 : 0, near: rnd() < 0.55,
        };
      });
    }

    function stepFlock(time, dt, w, h) {
      grid.clear();
      for (const b of flock) {
        const key = ((b.x / CELL) | 0) * 4096 + ((b.y / CELL) | 0);
        let cell = grid.get(key);
        if (!cell) grid.set(key, (cell = []));
        cell.push(b);
      }
      const A = target(time, w, h, 0);
      const B2 = target(time, w, h, 1);
      // part of the flock sometimes peels off toward a second target, then rejoins
      const split = Math.max(0, wander(time * 0.03, 9.4)) * 1.6;
      const kx = Math.cos(time * 0.07);
      const ky = Math.sin(time * 0.07);
      const breathe = wander(time * 0.08, 2.2);
      for (const b of flock) {
        const cx = (b.x / CELL) | 0;
        const cy = (b.y / CELL) | 0;
        let n = 0, ax = 0, ay = 0, px = 0, py = 0, sx = 0, sy = 0;
        for (let ox = -1; ox <= 1 && n < 7; ox++) {
          for (let oy = -1; oy <= 1 && n < 7; oy++) {
            const cell = grid.get((cx + ox) * 4096 + cy + oy);
            if (!cell) continue;
            for (const o of cell) {
              if (o === b) continue;
              const dx = o.x - b.x;
              const dy = o.y - b.y;
              const d2 = dx * dx + dy * dy;
              if (d2 > CELL * CELL) continue;
              ax += o.vx; ay += o.vy; px += o.x; py += o.y;
              if (d2 < 256) { sx -= dx / (d2 + 1); sy -= dy / (d2 + 1); }
              if (++n >= 7) break;
            }
          }
        }
        let fx = 0, fy = 0;
        if (n) {
          fx += (ax / n - b.vx) * 1.8 + (px / n - b.x) * (0.18 + 0.1 * breathe) + sx * 1500;
          fy += (ay / n - b.vy) * 1.8 + (py / n - b.y) * (0.18 + 0.1 * breathe) + sy * 1500;
        }
        const T = b.group && split > 0.5 ? B2 : A;
        const tx = T.x - b.x;
        const ty = T.y - b.y;
        const td = Math.hypot(tx, ty) + 1;
        const pull = 22 + Math.min(130, td * 0.18);
        fx += (tx / td) * pull;
        fy += (ty / td) * pull;
        // a ripple that sweeps across the flock, pushing birds sideways in turn
        const sp = Math.hypot(b.vx, b.vy) + 1e-3;
        b.wave = Math.sin((b.x * kx + b.y * ky) * 0.018 - time * 2.6);
        const wave = b.wave * 60;
        fx += (-b.vy / sp) * wave;
        fy += (b.vx / sp) * wave;
        b.vx += fx * dt;
        b.vy += fy * dt;
        const s2 = Math.hypot(b.vx, b.vy);
        const want = Math.min(135, Math.max(90, s2));
        b.vx = (b.vx / s2) * want;
        b.vy = (b.vy / s2) * want;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.h += wrapA(Math.atan2(b.vy, b.vx) - b.h) * (1 - Math.exp(-10 * dt));
        b.phase += dt * b.rate * TAU * (0.35 + 0.65 * (wander(time * 0.4, b.j) > -0.35));
      }
    }

    // ----- swallows: small fast groups that streak across and leave -----
    function spawnSwallows(w, h, g) {
      const fromLeft = rnd() < 0.5;
      const heading = (fromLeft ? 0 : Math.PI) + (rnd() - 0.5) * 0.7;
      const m = 120;
      g.x = fromLeft ? -m : w + m;
      g.y = h * (0.12 + rnd() * 0.7);
      g.heading = heading;
      g.speed = 300 + rnd() * 140;
      g.seed = rnd() * 100;
      g.wait = rnd() * 4;
      const count = 3 + Math.floor(rnd() * 5);
      g.birds = Array.from({ length: count }, () => ({
        ox: -rnd() * 170, oy: (rnd() - 0.5) * 120, s: 8 + rnd() * 5,
        phase: rnd() * TAU, rate: 4 + rnd() * 1.5, j: rnd() * 100,
      }));
      return g;
    }

    function stepSwallows(g, time, dt, w, h) {
      if (g.wait > 0) { g.wait -= dt; return; }
      g.heading += wander(time * 0.5, g.seed) * 0.5 * dt;
      g.x += Math.cos(g.heading) * g.speed * dt;
      g.y += Math.sin(g.heading) * g.speed * dt;
      const m = 420;
      if (g.x < -m || g.x > w + m || g.y < -m || g.y > h + m) spawnSwallows(w, h, g);
    }

    return {
      init(w, h) {
        bg = document.createElement('canvas');
        bg.width = w;
        bg.height = h;
        const b = bg.getContext('2d');
        b.fillStyle = '#000';
        b.fillRect(0, 0, w, h);
        // faint, still film grain baked in once
        const img = b.getImageData(0, 0, w, h);
        for (let i = 0; i < img.data.length; i += 4) {
          if (rnd() > 0.985) img.data[i] = img.data[i + 1] = img.data[i + 2] = 14 + rnd() * 18;
        }
        b.putImageData(img, 0, 0);
        const m = Math.min(w, h);
        layers = [
          { ...cloudLayer(w, h, 5, 0.1, 0.55, m * 0.22, 0.05), speed: 5 },
          { ...cloudLayer(w, h, 4, 0.3, 0.8, m * 0.28, 0.045), speed: 11 },
          { ...cloudLayer(w, h, 3, 0.5, 0.95, m * 0.34, 0.035), speed: 19 },
        ];
        const area = (w * h) / (1280 * 800);
        flock = makeFlock(w, h, Math.round(520 * Math.min(1.6, Math.max(0.6, area))));
        swallows = [0, 1, 2].map(() => spawnSwallows(w, h, {}));
        swallows.forEach((s, i) => { s.wait = i * 2.5; });
        // let the flock settle into shape before the first frame
        for (let i = 0; i < 90; i++) stepFlock(i / 30, 1 / 30, w, h);
      },
      frame(g, time, dt, w, h) {
        g.globalAlpha = 1;
        g.drawImage(bg, 0, 0);
        drawLayer(g, layers[0], time, w);
        stepFlock(time + 3, dt, w, h);
        g.fillStyle = '#ffffff';
        for (const near of [false, true]) {
          const p = new Path2D();
          for (const b of flock) {
            if (b.near !== near) continue;
            // wings tuck a little as the ripple passes, so the wave shows as a shimmer
            const open = (0.5 + 0.5 * Math.cos(b.phase)) * (1 - 0.25 * Math.max(0, b.wave));
            addBird(p, b.x, b.y, Math.cos(b.h), Math.sin(b.h), b.s * (near ? 1 : 0.8), open, 0);
          }
          g.globalAlpha = near ? 0.92 : 0.55;
          g.fill(p);
        }
        drawLayer(g, layers[1], time, w);
        const p = new Path2D();
        for (const sw of swallows) {
          stepSwallows(sw, time, dt, w, h);
          if (sw.wait > 0) continue;
          const c = Math.cos(sw.heading);
          const s = Math.sin(sw.heading);
          for (const b of sw.birds) {
            b.phase += dt * b.rate * TAU * (wander(time * 0.9, b.j) > 0 ? 1 : 0.08);
            const wob = wander(time * 1.1, b.j) * 14;
            const x = sw.x + b.ox * c - (b.oy + wob) * s;
            const y = sw.y + b.ox * s + (b.oy + wob) * c;
            const hd = sw.heading + wander(time * 1.7, b.j + 5) * 0.12;
            addBird(p, x, y, Math.cos(hd), Math.sin(hd), b.s, 0.5 + 0.5 * Math.cos(b.phase), 1);
          }
        }
        g.globalAlpha = 0.95;
        g.fill(p);
        drawLayer(g, layers[2], time, w);
        g.globalAlpha = 1;
      },
    };
  }

