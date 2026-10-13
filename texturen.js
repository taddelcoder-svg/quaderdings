'use strict';
// Quaderland - Kacheln, Gegenstands-Symbole, Risse, Wolken, Sonne und Mond werden beim Start selbst gezeichnet
// (Pixel-Look, keine fremden Bilddateien).
const Texturen = (function () {
  const NAMEN = ['gras_oben', 'gras_seite', 'erde', 'stein', 'sand', 'wasser', 'stamm_seite', 'stamm_oben', 'laub',
    'bretter', 'bruch', 'schnee', 'schnee_seite', 'glas', 'ziegel', 'grund', 'lampe',
    'wolle_rot', 'wolle_blau', 'wolle_gelb', 'wolle_gruen', 'wolle_weiss', 'wolle_schwarz',
    'hohesgras', 'blume_rot', 'blume_gelb', 'kornblume', 'fackel', 'kohleerz', 'eisenerz', 'golderz', 'diamanterz',
    'kies', 'sandstein_oben', 'sandstein_seite', 'steinziegel', 'birke_seite', 'birke_oben', 'birkenlaub',
    'kaktus_seite', 'kaktus_oben', 'werkbank_oben', 'werkbank_seite', 'buecher'];
  // Jede Kachel bekommt 2 Pixel Rand (Kopie ihrer Kante), damit bei Kantenglaettung keine Nachbarfarbe durchblitzt
  const PX = 16, RAND = 2, ZELLE = PX + 2 * RAND, SPALTEN = 8, ZEILEN = 8;

  function zufall(start) {
    let s = start >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  const klemme = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
  const wackeln = (c, a, r) => { const j = (r() - 0.5) * 2 * a; return [klemme(c[0] + j), klemme(c[1] + j), klemme(c[2] + j), 255]; };
  const mix = (a, b, t) => [klemme(a[0] + (b[0] - a[0]) * t), klemme(a[1] + (b[1] - a[1]) * t), klemme(a[2] + (b[2] - a[2]) * t), 255];
  const LEER = [0, 0, 0, 0];

  // Weiches, nahtlos wiederholbares Rauschen (0..1) fuer Flecken in den Kacheln
  function flecken(r, zelle) {
    const n = Math.max(1, Math.round(PX / zelle)), g = [];
    for (let i = 0; i < n * n; i++) g.push(r());
    const w = v => ((v % n) + n) % n;
    const s = t => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = x / zelle, fy = y / zelle, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = s(fx - x0), ty = s(fy - y0);
      const a = g[w(x0) + w(y0) * n], b = g[w(x0 + 1) + w(y0) * n], c = g[w(x0) + w(y0 + 1) * n], d = g[w(x0 + 1) + w(y0 + 1) * n];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
  }
  const hell = (c, f) => [klemme(c[0] * f), klemme(c[1] * f), klemme(c[2] * f), 255];
  const farbMix = (a, b, t) => mix(a, b, t < 0 ? 0 : t > 1 ? 1 : t);

  const ERDE = [121, 85, 58], GRAS = [92, 158, 58], GRAS_HELL = [122, 188, 72], GRAS_DUNKEL = [62, 124, 44];
  function erdePixel(f1, f2, kiesel, x, y, r) {
    const v = f1(x, y) * 0.65 + f2(x, y) * 0.35;
    let c = farbMix([100, 70, 47], [140, 100, 68], v);
    if (kiesel.has(x + y * PX)) c = hell([136, 124, 112], 0.9 + r() * 0.2);
    else if (r() < 0.07) c = hell(c, 0.78);
    return wackeln(c, 5, r);
  }
  function erdeKiesel(r) { const s = new Set(); for (let i = 0; i < 6; i++) s.add(Math.floor(r() * PX) + Math.floor(r() * PX) * PX); return s; }
  function grasPixel(f1, f2, x, y, r) {
    const v = f1(x, y) * 0.6 + f2(x, y) * 0.4;
    let c = farbMix(GRAS_DUNKEL, GRAS_HELL, 0.15 + v * 0.8);
    const z = r();
    if (z < 0.06) c = hell(c, 1.22); else if (z < 0.12) c = hell(c, 0.82);
    return wackeln(c, 5, r);
  }
  const steinPixel = (r, fleck, x, y, f1, f2) => {
    const v = f1 ? f1(x, y) * 0.6 + f2(x, y) * 0.4 : 0.5;
    const dunkel = fleck.some(f => Math.abs(f[0] - x) + Math.abs(f[1] - y) < 2) ? -16 : 0;
    const g = 112 + v * 36 + dunkel;
    return wackeln([g, g, g + 5], 6, r);
  };
  function steinBasis(r) {
    const fleck = []; for (let i = 0; i < 30; i++) fleck.push([Math.floor(r() * PX), Math.floor(r() * PX)]);
    const f1 = flecken(r, 8), f2 = flecken(r, 4);
    // Haarrisse
    const riss = new Set();
    for (let k = 0; k < 2; k++) {
      let x = Math.floor(r() * PX), y = Math.floor(r() * PX);
      for (let i = 0; i < 6; i++) { riss.add(((x + PX) % PX) + ((y + PX) % PX) * PX); x += r() < 0.5 ? 1 : 0; y += r() < 0.5 ? 1 : 0; }
    }
    return (x, y) => {
      if (riss.has(x + y * PX)) return wackeln([84, 84, 90], 4, r);
      if (riss.has(x - 1 + y * PX) || riss.has(x + (y - 1) * PX)) return wackeln([150, 150, 156], 4, r);
      return steinPixel(r, fleck, x, y, f1, f2);
    };
  }
  // Erz: Stein mit auffaellig geformten Adern. glanz = helle Pixel oben links in jedem Klumpen
  function erzKachel(farbe, dunkel, glanz, art) {
    return r => {
      const basis = steinBasis(r);
      const klumpen = [];
      for (let i = 0; i < 5; i++) {
        const m = new Set(['0,0']);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (r() < (art === 'punkt' ? 0.5 : 0.82)) m.add(dx + ',' + dy);
        let best = null;
        for (const k of m) { const [a, b] = k.split(',').map(Number); if (!best || a + b < best[0] + best[1] || (a + b === best[0] + best[1] && b < best[1])) best = [a, b]; }
        klumpen.push([2 + Math.floor(r() * 11), 2 + Math.floor(r() * 11), m, best[0] + ',' + best[1]]);
      }
      return (x, y) => {
        for (const [kx, ky, m, gl] of klumpen) {
          const dx = x - kx, dy = y - ky;
          if (m.has(dx + ',' + dy)) {
            if (dx + ',' + dy === gl) return glanz;
            return wackeln(dx + dy <= 0 ? farbe : dunkel, 8, r);
          }
        }
        for (const [kx, ky, m] of klumpen) {
          // dunkler Schlagschatten rechts unten neben einem Klumpen
          const dx = x - kx, dy = y - ky;
          if (m.has((dx - 1) + ',' + dy) || m.has(dx + ',' + (dy - 1))) return hell(basis(x, y), 0.7);
        }
        return basis(x, y);
      };
    };
  }
  function pflanze(stiel, bluete) {
    return r => (x, y) => {
      const dx = x - 7.5, dy = y - 5;
      if (bluete) {
        const d = dx * dx + dy * dy;
        if (d < 1.3) return [244, 214, 70, 255];
        if (d < 8 && (Math.abs(dx) < 1.2 || Math.abs(dy) < 1.2 || d < 5.5)) return wackeln(dx + dy < 0 ? hell(bluete, 1.12) : hell(bluete, 0.88), 8, r);
        if ((x === 7 || x === 8) && y > 7) return wackeln(hell(stiel, y > 11 ? 0.8 : 1), 8, r);
        if (y === 11 && (x === 5 || x === 6 || x === 9 || x === 10)) return wackeln(hell(stiel, 1.1), 8, r);
        if (y === 10 && (x === 4 || x === 11)) return wackeln(hell(stiel, 1.1), 8, r);
        return LEER;
      }
      return LEER;
    };
  }
  function planken(basis, fuge, korn) {
    return r => {
      const reihen = []; for (let i = 0; i < 4; i++) reihen.push([Math.floor(r() * 16), r()]);
      return (x, y) => {
        const ry = y >> 2, [vers, ton] = reihen[ry];
        if (y % 4 === 3) return wackeln(fuge, 4, r);
        if ((x + vers) % 16 === 0) return wackeln(fuge, 4, r);
        let c = hell(basis, 0.94 + ton * 0.12);
        if ((y % 4 === 0)) c = hell(c, 1.09);
        if ((x + ry * 5 + vers) % 7 === 2 && r() < 0.6) c = hell(c, 0.9);
        if (korn && (x + vers === 1 || x + vers === 14) && y % 4 === 1) return [92, 66, 38, 255];
        return wackeln(c, 4, r);
      };
    };
  }

  const KACHELN = {
    gras_oben: r => { const f1 = flecken(r, 8), f2 = flecken(r, 4); return (x, y) => grasPixel(f1, f2, x, y, r); },
    erde: r => { const f1 = flecken(r, 8), f2 = flecken(r, 4), k = erdeKiesel(r); return (x, y) => erdePixel(f1, f2, k, x, y, r); },
    gras_seite: r => {
      const f1 = flecken(r, 8), f2 = flecken(r, 4), k = erdeKiesel(r);
      const tiefe = []; for (let x = 0; x < PX; x++) tiefe.push(3 + Math.floor(r() * 3));
      return (x, y) => {
        if (y < tiefe[x]) return grasPixel(f1, f2, x, y, r);
        if (y === tiefe[x]) return wackeln([76, 104, 44], 5, r); // Schattenkante unter den Halmen
        const e = erdePixel(f1, f2, k, x, y, r);
        return y === tiefe[x] + 1 ? hell(e, 0.88) : e;
      };
    },
    stein: r => steinBasis(r),
    sand: r => {
      const f1 = flecken(r, 8);
      return (x, y) => {
        const welle = Math.sin((x * 0.7 + y * 0.35) * 1.1 + f1(x, y) * 3) * 0.5 + 0.5;
        let c = farbMix([210, 196, 144], [228, 216, 166], welle);
        if (r() < 0.07) c = hell(c, 0.86); else if (r() < 0.04) c = hell(c, 1.08);
        return wackeln(c, 4, r);
      };
    },
    wasser: r => {
      const f1 = flecken(r, 8), f2 = flecken(r, 4);
      return (x, y) => {
        const w = f1(x, y) * 0.6 + f2(x, y) * 0.4;
        const kamm = Math.sin((x + y * 0.6) * 0.85 + f1(x, y) * 5) > 0.82 ? 22 : 0;
        const v = (w - 0.5) * 26 + kamm + (r() - 0.5) * 4;
        return [klemme(48 + v * 0.8), klemme(110 + v), klemme(208 + v * 0.8), 255];
      };
    },
    stamm_seite: r => {
      const streifen = []; for (let x = 0; x < PX; x++) streifen.push((r() - 0.5) * 24);
      const knoten = [Math.floor(3 + r() * 10), Math.floor(2 + r() * 11)];
      const f1 = flecken(r, 8);
      return (x, y) => {
        const s = streifen[x] + (f1(x, y) - 0.5) * 14 + (x % 4 === 0 ? -8 : 0);
        if ((x === knoten[0] || x === knoten[0] + 1) && y >= knoten[1] && y <= knoten[1] + 1) return wackeln([66, 46, 26], 4, r);
        return wackeln([104 + s, 76 + s * 0.7, 46 + s * 0.4], 4, r);
      };
    },
    stamm_oben: r => (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const dr = Math.hypot(x - 7.5, y - 7.5) * 0.65 + d * 0.35;
      const ring = Math.floor(dr * 0.9) % 2 === 0 ? [182, 146, 92] : [152, 116, 70];
      if (d > 6.5) return wackeln([96 + (x % 3) * 5, 70, 42], 5, r);
      if (d < 1.5) return wackeln([128, 92, 54], 4, r);
      return wackeln(ring, 5, r);
    },
    laub: r => {
      const f1 = flecken(r, 4), f2 = flecken(r, 8);
      return (x, y) => {
        const v = f1(x, y) * 0.55 + f2(x, y) * 0.45;
        let c = farbMix([30, 84, 28], [78, 156, 56], v);
        const z = r();
        if (z < 0.1) c = [20, 58, 20, 255]; else if (z < 0.16) c = hell(c, 1.25);
        return wackeln(c, 6, r);
      };
    },
    bretter: planken([176, 138, 84], [104, 76, 42], true),
    bruch: r => {
      const zelle = []; for (let i = 0; i < 16; i++) zelle.push(r());
      return (x, y) => {
        const reihe = y >> 2, ox = (reihe % 2) * 2;
        const sx = (x + ox) >> 2;
        const v = zelle[(sx % 4) + (reihe % 4) * 4];
        const lx = (x + ox) % 4, ly = y % 4;
        const kante = lx === 0 || ly === 0;
        let grau = 96 + v * 48;
        if (kante) grau -= 36;
        else if (lx === 1 && ly === 1) grau += 14;
        else if (lx === 3 || ly === 3) grau -= 10;
        return wackeln([grau, grau, grau + 4], 5, r);
      };
    },
    schnee: r => {
      const f1 = flecken(r, 8);
      return (x, y) => {
        let c = farbMix([232, 241, 252], [252, 253, 255], f1(x, y));
        if (r() < 0.04) c = [255, 255, 255, 255]; else if (r() < 0.04) c = [214, 228, 246, 255];
        return wackeln(c, 2, r);
      };
    },
    schnee_seite: r => {
      const f1 = flecken(r, 8), f2 = flecken(r, 4), k = erdeKiesel(r);
      const tiefe = []; for (let x = 0; x < PX; x++) tiefe.push(4 + Math.floor(r() * 3));
      return (x, y) => {
        if (y < tiefe[x]) return wackeln(farbMix([232, 241, 252], [252, 253, 255], f1(x, y)), 3, r);
        if (y === tiefe[x]) return wackeln([196, 214, 236], 4, r);
        return erdePixel(f1, f2, k, x, y, r);
      };
    },
    glas: r => (x, y) => {
      if (x === 0 || y === 0 || x === PX - 1 || y === PX - 1) return [196, 226, 242, 255];
      if (x === 1 || y === 1) return [214, 238, 250, 120];
      if ((x === 3 && y >= 3 && y <= 7) || (y === 3 && x >= 3 && x <= 7) || (x === 4 && y === 4)) return [240, 250, 254, 255];
      if (x === 12 && y >= 10 && y <= 12) return [240, 250, 254, 200];
      if ((x + y) % 9 === 0) return [220, 240, 250, 70];
      return LEER;
    },
    ziegel: r => {
      const f1 = flecken(r, 4);
      return (x, y) => {
        const reihe = y >> 2, ly = y % 4;
        if (ly === 3) return wackeln([200, 192, 180], 5, r);
        const v = (x + (reihe % 2) * 4) % 8;
        if (v === 7) return wackeln([200, 192, 180], 5, r);
        let c = farbMix([142, 62, 46], [176, 88, 66], f1(x, y) * 0.7 + ((reihe * 3 + (x + (reihe % 2) * 4 >> 3)) % 4) * 0.08);
        if (ly === 0) c = hell(c, 1.14);
        if (v === 6) c = hell(c, 0.86);
        return wackeln(c, 5, r);
      };
    },
    grund: r => (x, y) => wackeln(r() < 0.25 ? [20, 20, 24] : [52, 52, 58], 8, r),
    lampe: r => (x, y) => {
      const rand = x === 0 || y === 0 || x === PX - 1 || y === PX - 1;
      const rand2 = x === 1 || y === 1 || x === PX - 2 || y === PX - 2;
      const kreuz = x === 7 || x === 8 || y === 7 || y === 8;
      if (rand) return [176, 124, 40, 255];
      if (rand2) return [226, 168, 66, 255];
      if (kreuz) return [214, 160, 64, 255];
      const d = Math.hypot(x - 7.5, y - 7.5);
      return farbMix([255, 250, 200], [255, 204, 96], d / 8);
    },
    hohesgras: r => {
      const halme = []; for (let i = 0; i < 8; i++) halme.push([1 + Math.floor(r() * 14), 2 + Math.floor(r() * 9), r() < 0.5 ? -1 : 1]);
      return (x, y) => {
        for (const [hx, hy, neig] of halme) {
          const hoch = 15 - hy, rel = y - hy;
          const sx = hx + (rel < hoch * 0.3 ? neig : 0);
          if (y >= hy && x === sx) return wackeln(rel < 2 ? [150, 210, 92] : farbMix([108, 176, 66], [56, 116, 40], rel / Math.max(1, hoch)), 8, r);
        }
        return LEER;
      };
    },
    blume_rot: pflanze([60, 130, 40], [204, 32, 40]),
    blume_gelb: pflanze([60, 130, 40], [242, 208, 44]),
    kornblume: pflanze([60, 130, 40], [74, 106, 226]),
    fackel: r => (x, y) => {
      if (x >= 6 && x <= 9 && y >= 2 && y <= 6) {
        // Flamme mit Farbverlauf
        const dx = Math.abs(x - 7.5), dy = y - 2;
        if (dx + dy * 0.35 > 2.2) return LEER;
        if (y <= 3) return [255, 244, 170, 255];
        if (y <= 5) return dx < 1 ? [255, 214, 90, 255] : [250, 150, 40, 255];
        return [226, 100, 30, 255];
      }
      if (x < 7 || x > 8 || y < 7) return LEER;
      if (y === 7) return [60, 36, 20, 255];
      return wackeln(x === 7 ? [128, 94, 54] : [98, 70, 40], 6, r);
    },
    kohleerz: erzKachel([52, 52, 58], [18, 18, 22], [96, 96, 108, 255], 'klumpen'),
    eisenerz: erzKachel([226, 188, 156], [176, 126, 94], [250, 232, 212, 255], 'punkt'),
    golderz: erzKachel([252, 224, 70], [204, 156, 30], [255, 252, 190, 255], 'nugget'),
    diamanterz: erzKachel([112, 240, 236], [34, 170, 190], [236, 255, 255, 255], 'kristall'),
    kies: r => {
      const f1 = flecken(r, 4);
      return (x, y) => {
        const v = f1(x, y), z = r();
        let c = z < 0.3 ? [96, 90, 86] : z < 0.6 ? [136, 128, 122] : [164, 154, 150];
        c = hell(c, 0.85 + v * 0.3);
        if ((x + y * 3) % 5 === 0) c = hell(c, 0.78);
        return wackeln(c, 8, r);
      };
    },
    sandstein_oben: r => { const f1 = flecken(r, 8); return (x, y) => wackeln(farbMix([206, 192, 138], [222, 208, 154], f1(x, y)), 4, r); },
    sandstein_seite: r => (x, y) => {
      if (y < 3) return wackeln([226, 212, 160], 4, r);
      if (y === 3 || y === 11) return wackeln([180, 164, 110], 4, r);
      if (y === 4 || y === 12) return wackeln([194, 178, 124], 4, r);
      return wackeln(y > 11 ? [202, 186, 132] : [214, 198, 144], 4, r);
    },
    steinziegel: r => (x, y) => {
      const reihe = y >> 3;
      const fuge = y % 8 === 7 || (y % 8 === 0 && y > 0) || (x + (reihe % 2) * 8) % 16 === 15;
      if (fuge) return wackeln([84, 84, 90], 4, r);
      let c = [136 + (reihe * 7 + ((x + (reihe % 2) * 8) >> 4) * 11) % 14, 0, 0]; c[1] = c[0]; c[2] = c[0] + 4;
      if (y % 8 === 1) c = hell(c, 1.1);
      if ((x + (reihe % 2) * 8) % 16 === 14 || y % 8 === 6) c = hell(c, 0.9);
      return wackeln(c, 5, r);
    },
    birke_seite: r => {
      const flecken2 = []; for (let i = 0; i < 8; i++) flecken2.push([Math.floor(r() * 13), Math.floor(r() * 16), 2 + Math.floor(r() * 3)]);
      return (x, y) => {
        for (const [fx, fy, l] of flecken2) if (y === fy && x >= fx && x < fx + l) return wackeln([44, 42, 38], 5, r);
        for (const [fx, fy, l] of flecken2) if (y === fy + 1 && x >= fx + 1 && x < fx + l) return wackeln([150, 148, 138], 5, r);
        return wackeln([228 - (x % 5 === 0 ? 14 : 0), 226 - (x % 5 === 0 ? 14 : 0), 214 - (x % 5 === 0 ? 14 : 0)], 6, r);
      };
    },
    birke_oben: r => (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.5) return wackeln([226, 224, 214], 5, r);
      const dr = Math.hypot(x - 7.5, y - 7.5) * 0.65 + d * 0.35;
      return wackeln(Math.floor(dr * 0.9) % 2 === 0 ? [216, 196, 144] : [192, 170, 118], 5, r);
    },
    birkenlaub: r => {
      const f1 = flecken(r, 4), f2 = flecken(r, 8);
      return (x, y) => {
        const v = f1(x, y) * 0.55 + f2(x, y) * 0.45;
        let c = farbMix([62, 108, 38], [138, 184, 80], v);
        const z = r();
        if (z < 0.1) c = [40, 74, 26, 255]; else if (z < 0.16) c = hell(c, 1.2);
        return wackeln(c, 6, r);
      };
    },
    kaktus_seite: r => (x, y) => {
      if (x === 0 || x === 15) return wackeln([34, 82, 28], 5, r);
      if (x === 1 || x === 14) return wackeln([48, 106, 38], 5, r);
      if ((x === 4 || x === 11) && y % 4 === 1) return [240, 238, 210, 255];
      if ((x === 3 || x === 12) && y % 4 === 3) return [210, 208, 180, 255];
      const rippe = x % 5 === 2 ? 0.8 : x % 5 === 3 ? 0.9 : 1.05;
      return wackeln(hell([66, 142, 50], rippe), 6, r);
    },
    kaktus_oben: r => (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.5) return wackeln([34, 82, 28], 5, r);
      if (d > 5.5) return wackeln([48, 106, 38], 5, r);
      return wackeln(d < 2 ? [140, 190, 96] : [84, 156, 62], 6, r);
    },
    werkbank_oben: r => (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return wackeln([100, 72, 40], 4, r);
      if (x === 5 || x === 10 || y === 5 || y === 10) return wackeln([124, 90, 52], 4, r);
      if (x === 1 || y === 1) return wackeln([200, 162, 106], 4, r);
      return wackeln([184, 146, 92], 6, r);
    },
    werkbank_seite: r => (x, y) => {
      if (y < 3) return wackeln(y === 0 ? [130, 96, 56] : [108, 78, 44], 4, r);
      // Saege und Hammer angedeutet
      if (y >= 5 && y <= 6 && x >= 2 && x <= 7) return wackeln(y === 5 ? [208, 208, 214] : [150, 150, 158], 5, r);
      if (y === 7 && x >= 2 && x <= 7 && x % 2 === 0) return [120, 120, 128, 255];
      if (x === 11 && y >= 5 && y <= 12) return wackeln([90, 64, 36], 5, r);
      if (y === 5 && x >= 9 && x <= 13) return wackeln([150, 150, 158], 5, r);
      if (y === 6 && x >= 9 && x <= 13) return wackeln([108, 108, 116], 5, r);
      if (y % 4 === 3) return wackeln([108, 78, 44], 4, r);
      return wackeln([168, 130, 78], 6, r);
    },
    buecher: r => {
      const farben = [[150, 40, 40], [40, 80, 150], [50, 120, 60], [140, 110, 40], [100, 50, 120]];
      const reihen = [[], []];
      for (let k = 0; k < 2; k++) { let x = 1; while (x < 15) { const b = 1 + Math.floor(r() * 3); reihen[k].push([x, Math.min(15, x + b), farben[Math.floor(r() * farben.length)], r() < 0.3 ? 0 : 1 + Math.floor(r() * 2)]); x += b; } }
      return (x, y) => {
        if (y === 0 || y === 15 || y === 7 || y === 8) return wackeln(y === 0 ? [172, 132, 80] : [140, 104, 58], 5, r);
        if (x === 0 || x === 15) return wackeln([124, 92, 52], 4, r);
        const reihe = reihen[y < 7 ? 0 : 1], yy = y < 7 ? y - 1 : y - 9;
        for (const [a, b, f, hoehe] of reihe) if (x >= a && x < b) {
          if (yy < hoehe) return wackeln([60, 40, 24], 4, r);
          let c = x === a ? hell(f, 0.68) : x === b - 1 && b - a > 1 ? hell(f, 0.85) : f;
          if (yy === hoehe) c = hell(c, 1.2);
          if (yy === 3 && b - a > 1) c = [226, 206, 140, 255];
          return wackeln(c, 5, r);
        }
        return wackeln([54, 36, 22], 4, r);
      };
    }
  };
  // Wolle: leichtes Gewebe mit kleinen Fasern
  function wolle(farbe) {
    return r => (x, y) => {
      const w = ((x + y) & 1) ? 6 : -6, f = (x % 4 === 0 && y % 4 === 0) ? -12 : 0;
      const k = r() < 0.05 ? 10 : 0;
      return wackeln([farbe[0] + w + f + k, farbe[1] + w + f + k, farbe[2] + w + f + k], 4, r);
    };
  }
  KACHELN.wolle_rot = wolle([188, 48, 48]);
  KACHELN.wolle_blau = wolle([52, 84, 196]);
  KACHELN.wolle_gelb = wolle([228, 196, 56]);
  KACHELN.wolle_gruen = wolle([64, 156, 60]);
  KACHELN.wolle_weiss = wolle([232, 232, 236]);
  KACHELN.wolle_schwarz = wolle([36, 36, 42]);

  const mittelfarben = {}, paletten = {};
  function atlas() {
    const c = document.createElement('canvas');
    c.width = SPALTEN * ZELLE; c.height = ZEILEN * ZELLE;
    const ctx = c.getContext('2d');
    NAMEN.forEach((name, i) => {
      const r = zufall(i * 7919 + 17);
      const f = KACHELN[name](r);
      const px = [];
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
        const p = f(x, y); px.push(p);
        if (p[3] > 128) { sr += p[0]; sg += p[1]; sb += p[2]; n++; }
      }
      // Ein paar echte Pixelfarben der Kachel fuer Bruchstuecke beim Abbauen
      const pal = []; for (let q = 0; q < 8; q++) { const p = px[Math.floor(((q * 37 + 11) % 256))]; if (p[3] > 128) pal.push([p[0] / 255, p[1] / 255, p[2] / 255]); }
      paletten[name] = pal;
      mittelfarben[name] = n ? [sr / n / 255, sg / n / 255, sb / n / 255] : [1, 1, 1];
      const img = ctx.createImageData(ZELLE, ZELLE);
      const k = v => Math.max(0, Math.min(PX - 1, v - RAND));
      for (let y = 0; y < ZELLE; y++) for (let x = 0; x < ZELLE; x++) {
        const p = px[k(y) * PX + k(x)], o = (y * ZELLE + x) * 4;
        img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = p[3];
      }
      ctx.putImageData(img, (i % SPALTEN) * ZELLE, Math.floor(i / SPALTEN) * ZELLE);
    });
    return c;
  }
  const kachelPos = name => { const i = NAMEN.indexOf(name); return [(i % SPALTEN) * ZELLE + RAND, Math.floor(i / SPALTEN) * ZELLE + RAND]; };

  // Kleiner Wuerfel als Symbol fuer Hotbar und Inventar
  function symbol(atlasCanvas, oben, seite, groesse) {
    const S = groesse, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const m = 2, mitte = S / 2, hoch = S * 0.27, cy = 2 * hoch - m, tief = S - m - cy;
    const zeichne = (name, ox, oy, ax, ay, bx, by, dunkel) => {
      const [sx, sy] = kachelPos(name);
      ctx.save();
      ctx.setTransform(ax / PX, ay / PX, bx / PX, by / PX, ox, oy);
      ctx.drawImage(atlasCanvas, sx, sy, PX, PX, 0, 0, PX, PX);
      if (dunkel) { ctx.fillStyle = 'rgba(0,0,0,' + dunkel + ')'; ctx.fillRect(0, 0, PX, PX); }
      ctx.restore();
    };
    zeichne(oben, mitte, m, mitte - m, hoch - m, -(mitte - m), hoch - m, 0);
    zeichne(seite, m, hoch, mitte - m, hoch - m, 0, tief, 0.28);
    zeichne(seite, mitte, cy, mitte - m, -(hoch - m), 0, tief, 0.5);
    return c;
  }
  // Flaches Symbol (Pflanzen, Fackel): die Kachel selbst
  function flachSymbol(atlasCanvas, name, groesse) {
    const c = document.createElement('canvas'); c.width = c.height = groesse;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const [sx, sy] = kachelPos(name);
    ctx.drawImage(atlasCanvas, sx, sy, PX, PX, 0, 0, groesse, groesse);
    return c;
  }

  // ---------- Gegenstands-Symbole (16x16-Pixelmasken) ----------
  const FORMEN = {
    spitzhacke: ['................', '...KKKKKKKKK....', '..KKKKKKKKKKK...', '.KK....SS...KK..', '.K.....SS....K..', '.......SS.......',
      '.......SS.......', '.......SS.......', '.......SS.......', '.......SS.......', '.......SS.......', '.......SS.......',
      '.......SS.......', '.......SS.......', '................', '................'],
    axt: ['................', '.......SS.......', '...KKKKSS.......', '..KKKKKSS.......', '..KKKKKSS.......', '..KKKKKSS.......',
      '...KKKKSS.......', '.......SS.......', '.......SS.......', '.......SS.......', '.......SS.......', '.......SS.......',
      '.......SS.......', '.......SS.......', '................', '................'],
    schaufel: ['................', '......KKKK......', '.....KKKKKK.....', '.....KKKKKK.....', '.....KKKKKK.....', '.....KKKKKK.....',
      '......KKKK......', '.......SS.......', '.......SS.......', '.......SS.......', '.......SS.......', '.......SS.......',
      '.......SS.......', '......SSSS......', '................', '................'],
    schwert: ['.......KK.......', '......KKKK......', '......KKKK......', '......KKKK......', '......KKKK......', '......KKKK......',
      '......KKKK......', '......KKKK......', '......KKKK......', '...SSSSSSSSSS...', '...SSSSSSSSSS...', '.......SS.......',
      '.......SS.......', '.......SS.......', '......SSSS......', '................'],
    stock: ['................', '...........SS...', '..........SS....', '.........SS.....', '........SS......', '.......SS.......',
      '......SS........', '.....SS.........', '....SS..........', '...SS...........', '..SS............', '................',
      '................', '................', '................', '................'],
    barren: ['................', '................', '................', '................', '.....KKKKKKK....', '....KKKKKKKKK...',
      '...KKKKKKKKKKK..', '..KKKKKKKKKKKKK.', '..KKKKKKKKKKKKK.', '................', '................', '................',
      '................', '................', '................', '................'],
    klumpen: ['................', '................', '................', '......KKK.......', '....KKKKKKK.....', '...KKKKKKKKK....',
      '...KKKKKKKKKK...', '..KKKKKKKKKKK...', '..KKKKKKKKKKK...', '...KKKKKKKKK....', '....KKKKKKK.....', '.....KKKK.......',
      '................', '................', '................', '................'],
    diamant: ['................', '................', '................', '....KKKKKKKK....', '...KKKKKKKKKK...', '..KKKKKKKKKKKK..',
      '...KKKKKKKKKK...', '....KKKKKKKK....', '.....KKKKKK.....', '......KKKK......', '.......KK.......', '................',
      '................', '................', '................', '................'],
    apfel: ['................', '.......S........', '.......SG.......', '....KKKSKKK.....', '...KKKKKKKKK....', '..KKKKKKKKKKK...',
      '..KKKKKKKKKKK...', '..KKKKKKKKKKK...', '..KKKKKKKKKKK...', '...KKKKKKKKK....', '....KKKKKKK.....', '.....KK.KK......',
      '................', '................', '................', '................'],
    fleisch: ['................', '................', '.....KKKKK......', '...KKKKKKKKK....', '..KKKKFFKKKKK...', '..KKKFFFFKKKK...',
      '..KKKKFFKKKKKS..', '...KKKKKKKKKSS..', '....KKKKKKKSSS..', '.......KKK..SS..', '.............S..', '................',
      '................', '................', '................', '................']
  };
  // 16x16-Pixelbild eines Gegenstands (mit Kantenlicht oben/links, Schatten unten/rechts, dunkler Umriss)
  function gegenstandPixel(form, farbe) {
    const maske = FORMEN[form];
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(16, 16);
    const voll = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && maske[y][x] !== '.';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const z = maske[y][x], o = (y * 16 + x) * 4;
      let p = null;
      if (z === 'K') {
        let f = 1.2 - y / 16 * 0.45 - (x / 16) * 0.15;
        if (!voll(x, y - 1) || !voll(x - 1, y)) f *= 1.22;          // Lichtkante
        else if (!voll(x, y + 1) || !voll(x + 1, y)) f *= 0.78;      // Schattenkante
        else if ((x * 5 + y * 3) % 7 === 0) f *= 1.08;               // feine Maserung
        p = [farbe[0] * f, farbe[1] * f, farbe[2] * f, 255];
      }
      else if (z === 'S') p = [(x % 2 ? 128 : 112) - y * 2, (x % 2 ? 92 : 80) - y * 2, 52, 255];
      else if (z === 'G') p = [70, 150, 50, 255];
      else if (z === 'F') p = [240, 220, 210, 255];
      else if (voll(x - 1, y) || voll(x + 1, y) || voll(x, y - 1) || voll(x, y + 1)) p = [20, 16, 14, 170];
      if (p) { img.data[o] = klemme(p[0]); img.data[o + 1] = klemme(p[1]); img.data[o + 2] = klemme(p[2]); img.data[o + 3] = p[3]; }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function gegenstandSymbol(form, farbe, groesse) {
    const c = gegenstandPixel(form, farbe);
    const g = document.createElement('canvas'); g.width = g.height = groesse;
    const gx = g.getContext('2d'); gx.imageSmoothingEnabled = false;
    gx.drawImage(c, 0, 0, groesse, groesse);
    return g;
  }

  // ---------- Risse beim Abbauen (8 Stufen nebeneinander) ----------
  function risse() {
    const c = document.createElement('canvas'); c.width = PX * 8; c.height = PX;
    const ctx = c.getContext('2d');
    const r = zufall(4242);
    const pfade = [];
    for (let i = 0; i < 6; i++) {
      let x = 7.5, y = 7.5; const p = [];
      const w = r() * Math.PI * 2;
      for (let k = 0; k < 14; k++) { x += Math.cos(w + (r() - 0.5) * 1.6); y += Math.sin(w + (r() - 0.5) * 1.6); p.push([Math.floor(x), Math.floor(y)]); }
      pfade.push(p);
    }
    for (let s = 0; s < 8; s++) {
      const laenge = Math.round((s + 1) / 8 * 14);
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      for (let i = 0; i < pfade.length; i++) {
        if (i > s) break;
        for (let k = 0; k < laenge; k++) {
          const [x, y] = pfade[i][k];
          if (x >= 0 && y >= 0 && x < PX && y < PX) ctx.fillRect(s * PX + x, y, 1, 1);
        }
      }
    }
    return c;
  }

  // ---------- Wolken (weiche, von oben beleuchtete Pixelwolken) ----------
  function wolken(seed) {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
    const h = (x, y) => { let v = Math.imul(x * 374761393 + y * 668265263 + seed, 1274126177); v ^= v >>> 15; v = Math.imul(v, 2246822519); v ^= v >>> 13; return ((v >>> 0) % 1000) / 1000; };
    const wert = (x, y, f) => {
      const x0 = Math.floor(x / f), y0 = Math.floor(y / f), fx = x / f - x0, fy = y / f - y0, m = N / f;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const g = (a, b) => h(((a % m) + m) % m, ((b % m) + m) % m);
      const a = g(x0, y0), b = g(x0 + 1, y0), cc = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
      return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
    };
    const dichte = (x, y) => wert(x, y, 32) * 0.5 + wert(x, y, 16) * 0.28 + wert(x, y, 8) * 0.15 + wert(x, y, 4) * 0.07;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = dichte(x, y), o = (y * N + x) * 4;
      const kern = (v - 0.585) * 5;                       // 0 = Rand, hoch = dicker Kern
      // Licht von "oben links": Dichte-Gefaelle zur Lichtseite, dicke Kerne etwas grauer (Wolkenunterseite)
      const vl = dichte((x + N - 1) % N, (y + N - 1) % N);
      const dick = Math.max(0, Math.min(1, (kern - 0.3) / 1.7));
      const hellig = Math.max(0.7, Math.min(1, 1 - 0.13 * dick + Math.max(-0.07, Math.min(0.05, (vl - v) * -2.4))));
      const g = Math.round(255 * hellig);
      img.data[o] = g; img.data[o + 1] = Math.round(g * 0.985); img.data[o + 2] = Math.min(255, Math.round(g * 1.0 + 6));
      const t = Math.max(0, Math.min(1, kern * 1.1));
      img.data[o + 3] = Math.round(250 * t * (2 - t));
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // ---------- Himmelskoerper: Sonne mit Strahlenkranz, Mond mit Kratern ----------
  function sonne() {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), m = N / 2;
    let g = x.createRadialGradient(m, m, 8, m, m, m);
    g.addColorStop(0, 'rgba(255,238,170,0.6)'); g.addColorStop(0.3, 'rgba(255,224,140,0.25)'); g.addColorStop(1, 'rgba(255,208,100,0)');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    g = x.createRadialGradient(m, m, 0, m, m, 21);
    g.addColorStop(0, '#fffdf0'); g.addColorStop(0.75, '#ffe99a'); g.addColorStop(1, '#ffc94a');
    x.fillStyle = g; x.beginPath(); x.arc(m, m, 21, 0, Math.PI * 2); x.fill();
    return c;
  }
  function mond() {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), m = N / 2;
    let g = x.createRadialGradient(m, m, 10, m, m, m);
    g.addColorStop(0, 'rgba(190,210,255,0.35)'); g.addColorStop(1, 'rgba(160,190,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    x.fillStyle = '#e9efff'; x.beginPath(); x.arc(m, m, 24, 0, Math.PI * 2); x.fill();
    const r = zufall(99);
    x.save(); x.beginPath(); x.arc(m, m, 24, 0, Math.PI * 2); x.clip();
    for (let i = 0; i < 9; i++) {
      const cx = m - 17 + r() * 34, cy = m - 17 + r() * 34, rr = 2.5 + r() * 5;
      x.fillStyle = 'rgba(150,164,196,0.55)'; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.arc(cx - rr * 0.25, cy - rr * 0.25, rr * 0.7, 0, Math.PI * 2); x.fill();
    }
    x.restore();
    return c;
  }
  // Weicher dunkler Fleck unter Figuren
  function schattenFleck() {
    const N = 32, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 1, 16, 16, 16);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    return c;
  }
  // Kleines Fell-/Haut-Rauschen (Graustufen), wird mit der Figurenfarbe multipliziert
  function fellKachel() {
    const N = 8, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), img = x.createImageData(N, N), r = zufall(7);
    for (let i = 0; i < N * N; i++) { const v = klemme(226 + (r() - 0.5) * 36 - (r() < 0.12 ? 20 : 0)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    return c;
  }

  return { NAMEN, PX, RAND, ZELLE, SPALTEN, ZEILEN, atlas, symbol, flachSymbol, gegenstandSymbol, gegenstandPixel, risse, wolken, sonne, mond, schattenFleck, fellKachel, mittelfarben, paletten, index: n => NAMEN.indexOf(n) };
})();
