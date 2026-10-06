'use strict';
// Quaderland - Kacheln werden beim Start selbst gezeichnet (Pixel-Look, keine fremden Bilddateien).
const Texturen = (function () {
  const NAMEN = ['gras_oben', 'gras_seite', 'erde', 'stein', 'sand', 'wasser', 'stamm_seite', 'stamm_oben', 'laub',
    'bretter', 'bruch', 'schnee', 'schnee_seite', 'glas', 'ziegel', 'grund', 'lampe',
    'wolle_rot', 'wolle_blau', 'wolle_gelb', 'wolle_gruen', 'wolle_weiss', 'wolle_schwarz'];
  const PX = 16, SPALTEN = 8, ZEILEN = 4;

  function zufall(start) {
    let s = start >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  const klemme = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
  const wackeln = (c, a, r) => { const j = (r() - 0.5) * 2 * a; return [klemme(c[0] + j), klemme(c[1] + j), klemme(c[2] + j), 255]; };
  const mix = (a, b, t) => [klemme(a[0] + (b[0] - a[0]) * t), klemme(a[1] + (b[1] - a[1]) * t), klemme(a[2] + (b[2] - a[2]) * t), 255];

  const ERDE = [121, 85, 58], GRAS = [92, 158, 58];
  const KACHELN = {
    gras_oben: r => (x, y) => wackeln(r() < 0.12 ? [70, 130, 45] : GRAS, 14, r),
    erde: r => (x, y) => wackeln(r() < 0.1 ? [96, 66, 44] : ERDE, 12, r),
    gras_seite: r => {
      const tiefe = []; for (let x = 0; x < PX; x++) tiefe.push(3 + Math.floor(r() * 3));
      return (x, y) => y < tiefe[x] ? wackeln(GRAS, 14, r) : wackeln(r() < 0.1 ? [96, 66, 44] : ERDE, 12, r);
    },
    stein: r => {
      const fleck = []; for (let i = 0; i < 40; i++) fleck.push([Math.floor(r() * PX), Math.floor(r() * PX)]);
      return (x, y) => {
        const dunkel = fleck.some(f => Math.abs(f[0] - x) + Math.abs(f[1] - y) < 2) ? -18 : 0;
        return wackeln([126 + dunkel, 126 + dunkel, 130 + dunkel], 9, r);
      };
    },
    sand: r => (x, y) => wackeln(r() < 0.08 ? [196, 184, 136] : [220, 208, 156], 7, r),
    wasser: r => (x, y) => {
      const w = Math.sin((x + y * 0.7) * 0.9) * 8 + (r() - 0.5) * 6;
      return [klemme(46 + w), klemme(104 + w), klemme(206 + w), 255];
    },
    stamm_seite: r => {
      const streifen = []; for (let x = 0; x < PX; x++) streifen.push((r() - 0.5) * 22);
      return (x, y) => wackeln([104 + streifen[x], 76 + streifen[x] * 0.7, 46 + streifen[x] * 0.4], 5, r);
    },
    stamm_oben: r => (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const ring = Math.floor(d) % 2 === 0 ? [176, 140, 88] : [150, 114, 68];
      return d > 6.5 ? wackeln([104, 76, 46], 6, r) : wackeln(ring, 5, r);
    },
    laub: r => (x, y) => {
      if (r() < 0.14) return wackeln([22, 62, 20], 6, r);
      return wackeln(r() < 0.3 ? [38, 104, 32] : [58, 132, 46], 12, r);
    },
    bretter: r => (x, y) => {
      if (y % 4 === 3) return wackeln([112, 82, 46], 5, r);
      const fuge = ((y >> 2) % 2 === 0 ? 3 : 11);
      if (x === fuge) return wackeln([128, 96, 56], 5, r);
      return wackeln([176, 138, 84], 7, r);
    },
    bruch: r => {
      const zelle = []; for (let i = 0; i < 16; i++) zelle.push(r());
      return (x, y) => {
        const sx = (x + ((y >> 2) % 2) * 2) >> 2, sy = y >> 2;
        const v = zelle[(sx % 4) + (sy % 4) * 4];
        const kante = ((x + ((y >> 2) % 2) * 2) % 4 === 0) || (y % 4 === 0);
        const grau = 100 + v * 45 - (kante ? 28 : 0);
        return wackeln([grau, grau, grau + 4], 6, r);
      };
    },
    schnee: r => (x, y) => wackeln([246, 249, 255], 5, r),
    schnee_seite: r => {
      const tiefe = []; for (let x = 0; x < PX; x++) tiefe.push(4 + Math.floor(r() * 3));
      return (x, y) => y < tiefe[x] ? wackeln([246, 249, 255], 5, r) : wackeln(r() < 0.1 ? [96, 66, 44] : ERDE, 12, r);
    },
    glas: r => (x, y) => {
      if (x === 0 || y === 0 || x === PX - 1 || y === PX - 1) return [206, 232, 244, 255];
      if ((x === 3 && y >= 3 && y <= 6) || (y === 3 && x >= 3 && x <= 6) || (x === 4 && y === 4)) return [235, 247, 252, 255];
      return [0, 0, 0, 0];
    },
    ziegel: r => (x, y) => {
      const reihe = y >> 2;
      if (y % 4 === 3) return wackeln([196, 188, 178], 6, r);
      const v = (x + (reihe % 2) * 4) % 8;
      if (v === 7) return wackeln([196, 188, 178], 6, r);
      return wackeln(r() < 0.2 ? [132, 58, 44] : [156, 72, 56], 8, r);
    },
    grund: r => (x, y) => wackeln(r() < 0.25 ? [20, 20, 24] : [52, 52, 58], 8, r),
    lampe: r => (x, y) => {
      const rand = x === 0 || y === 0 || x === PX - 1 || y === PX - 1;
      const kreuz = x === 7 || x === 8 || y === 7 || y === 8;
      if (rand) return [196, 142, 52, 255];
      return kreuz ? [255, 240, 176, 255] : mix([255, 214, 120], [255, 240, 176], r());
    }
  };
  function wolle(farbe) {
    return r => (x, y) => wackeln([farbe[0] + (((x + y) & 1) ? 7 : -7), farbe[1] + (((x + y) & 1) ? 7 : -7), farbe[2] + (((x + y) & 1) ? 7 : -7)], 4, r);
  }
  KACHELN.wolle_rot = wolle([188, 48, 48]);
  KACHELN.wolle_blau = wolle([52, 84, 196]);
  KACHELN.wolle_gelb = wolle([228, 196, 56]);
  KACHELN.wolle_gruen = wolle([64, 156, 60]);
  KACHELN.wolle_weiss = wolle([232, 232, 236]);
  KACHELN.wolle_schwarz = wolle([36, 36, 42]);

  function atlas() {
    const c = document.createElement('canvas');
    c.width = SPALTEN * PX; c.height = ZEILEN * PX;
    const ctx = c.getContext('2d');
    NAMEN.forEach((name, i) => {
      const r = zufall(i * 7919 + 17);
      const f = KACHELN[name](r);
      const img = ctx.createImageData(PX, PX);
      for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
        const p = f(x, y), o = (y * PX + x) * 4;
        img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = p[3];
      }
      ctx.putImageData(img, (i % SPALTEN) * PX, Math.floor(i / SPALTEN) * PX);
    });
    return c;
  }

  // Kleiner Wuerfel als Symbol fuer Hotbar und Inventar
  function symbol(atlasCanvas, oben, seite, groesse) {
    const S = groesse, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const kachel = (name) => { const i = NAMEN.indexOf(name); return [(i % SPALTEN) * PX, Math.floor(i / SPALTEN) * PX]; };
    const m = 2, mitte = S / 2, hoch = S * 0.27, cy = 2 * hoch - m, tief = S - m - cy;
    const zeichne = (name, ox, oy, ax, ay, bx, by, dunkel) => {
      const [sx, sy] = kachel(name);
      ctx.save();
      ctx.setTransform(ax / PX, ay / PX, bx / PX, by / PX, ox, oy);
      ctx.drawImage(atlasCanvas, sx, sy, PX, PX, 0, 0, PX, PX);
      if (dunkel) { ctx.fillStyle = 'rgba(0,0,0,' + dunkel + ')'; ctx.fillRect(0, 0, PX, PX); }
      ctx.restore();
    };
    // oben: Ursprung = Spitze, x-Achse nach rechts unten, y-Achse nach links unten
    zeichne(oben, mitte, m, mitte - m, hoch - m, -(mitte - m), hoch - m, 0);
    // links
    zeichne(seite, m, hoch, mitte - m, hoch - m, 0, tief, 0.28);
    // rechts
    zeichne(seite, mitte, cy, mitte - m, -(hoch - m), 0, tief, 0.5);
    return c;
  }

  return { NAMEN, PX, SPALTEN, ZEILEN, atlas, symbol, index: n => NAMEN.indexOf(n) };
})();
