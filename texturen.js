'use strict';
// Quaderland - Kacheln, Gegenstands-Symbole, Risse und Wolken werden beim Start selbst gezeichnet
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

  const ERDE = [121, 85, 58], GRAS = [92, 158, 58];
  const steinPixel = (r, fleck, x, y) => {
    const dunkel = fleck.some(f => Math.abs(f[0] - x) + Math.abs(f[1] - y) < 2) ? -18 : 0;
    return wackeln([126 + dunkel, 126 + dunkel, 130 + dunkel], 9, r);
  };
  function erzKachel(farbe, dunkel) {
    return r => {
      const fleck = []; for (let i = 0; i < 40; i++) fleck.push([Math.floor(r() * PX), Math.floor(r() * PX)]);
      const klumpen = []; for (let i = 0; i < 5; i++) klumpen.push([2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12)]);
      return (x, y) => {
        for (const k of klumpen) {
          const dx = x - k[0], dy = y - k[1];
          if (dx * dx + dy * dy <= 1.6 && (dx !== 1 || dy !== 1)) return wackeln((dx + dy) < 0 ? farbe : dunkel, 10, r);
        }
        return steinPixel(r, fleck, x, y);
      };
    };
  }
  function pflanze(stiel, bluete) {
    return r => (x, y) => {
      if (bluete) {
        const dx = x - 7.5, dy = y - 5;
        if (dx * dx + dy * dy < 7) return dx * dx + dy * dy < 1.5 ? [240, 220, 80, 255] : wackeln(bluete, 14, r);
        if ((x === 7 || x === 8) && y > 7) return wackeln(stiel, 10, r);
        if (y === 11 && (x === 6 || x === 9)) return wackeln(stiel, 10, r);
        return LEER;
      }
      return LEER;
    };
  }

  const KACHELN = {
    gras_oben: r => (x, y) => wackeln(r() < 0.12 ? [70, 130, 45] : GRAS, 14, r),
    erde: r => (x, y) => wackeln(r() < 0.1 ? [96, 66, 44] : ERDE, 12, r),
    gras_seite: r => {
      const tiefe = []; for (let x = 0; x < PX; x++) tiefe.push(3 + Math.floor(r() * 3));
      return (x, y) => y < tiefe[x] ? wackeln(GRAS, 14, r) : wackeln(r() < 0.1 ? [96, 66, 44] : ERDE, 12, r);
    },
    stein: r => {
      const fleck = []; for (let i = 0; i < 40; i++) fleck.push([Math.floor(r() * PX), Math.floor(r() * PX)]);
      return (x, y) => steinPixel(r, fleck, x, y);
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
      return LEER;
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
    },
    hohesgras: r => {
      const halme = []; for (let i = 0; i < 7; i++) halme.push([1 + Math.floor(r() * 14), 3 + Math.floor(r() * 9), r() < 0.5 ? -1 : 1]);
      return (x, y) => {
        for (const [hx, hy, neig] of halme) {
          const sx = hx + Math.round((15 - y) < 6 ? 0 : neig * (y < hy + 3 ? 1 : 0));
          if (y >= hy && x === sx) return wackeln(y < hy + 2 ? [110, 176, 70] : [72, 138, 48], 10, r);
        }
        return LEER;
      };
    },
    blume_rot: pflanze([60, 130, 40], [200, 30, 36]),
    blume_gelb: pflanze([60, 130, 40], [238, 206, 40]),
    kornblume: pflanze([60, 130, 40], [70, 100, 220]),
    fackel: r => (x, y) => {
      if (x < 7 || x > 8 || y < 6) return LEER;
      if (y <= 7) return [255, 236, 120, 255];
      if (y === 8) return [240, 150, 40, 255];
      return wackeln([110, 80, 46], 8, r);
    },
    kohleerz: erzKachel([40, 40, 44], [20, 20, 22]),
    eisenerz: erzKachel([222, 190, 160], [176, 132, 100]),
    golderz: erzKachel([250, 220, 70], [200, 160, 30]),
    diamanterz: erzKachel([120, 240, 236], [40, 180, 190]),
    kies: r => (x, y) => {
      const v = r();
      return wackeln(v < 0.3 ? [100, 92, 88] : v < 0.6 ? [138, 128, 122] : [160, 150, 146], 10, r);
    },
    sandstein_oben: r => (x, y) => wackeln([214, 200, 146], 5, r),
    sandstein_seite: r => (x, y) => {
      if (y < 3) return wackeln([222, 208, 156], 5, r);
      if (y === 3 || y === 11) return wackeln([186, 170, 116], 5, r);
      return wackeln(y > 11 ? [200, 184, 130] : [214, 198, 144], 5, r);
    },
    steinziegel: r => (x, y) => {
      const reihe = y >> 3;
      if (y % 8 === 7 || y % 8 === 0 && y > 0) return wackeln([92, 92, 96], 5, r);
      if ((x + (reihe % 2) * 8) % 16 === 15) return wackeln([92, 92, 96], 5, r);
      return wackeln([134, 134, 138], 8, r);
    },
    birke_seite: r => {
      const flecken = []; for (let i = 0; i < 7; i++) flecken.push([Math.floor(r() * 13), Math.floor(r() * 16), 2 + Math.floor(r() * 3)]);
      return (x, y) => {
        for (const [fx, fy, l] of flecken) if (y === fy && x >= fx && x < fx + l) return wackeln([46, 44, 40], 6, r);
        return wackeln([226, 224, 214], 8, r);
      };
    },
    birke_oben: r => (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.5) return wackeln([226, 224, 214], 6, r);
      return wackeln(Math.floor(d) % 2 === 0 ? [212, 192, 140] : [190, 168, 116], 5, r);
    },
    birkenlaub: r => (x, y) => {
      if (r() < 0.14) return wackeln([46, 82, 30], 6, r);
      return wackeln(r() < 0.3 ? [86, 134, 52] : [118, 164, 70], 12, r);
    },
    kaktus_seite: r => (x, y) => {
      if (x === 0 || x === 15) return wackeln([40, 90, 30], 6, r);
      if ((x === 4 || x === 11) && y % 4 === 1) return [230, 230, 200, 255];
      return wackeln(x % 4 === 2 ? [52, 118, 40] : [70, 144, 52], 8, r);
    },
    kaktus_oben: r => (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      return wackeln(d > 6.5 ? [40, 90, 30] : d < 2 ? [120, 170, 80] : [80, 150, 60], 6, r);
    },
    werkbank_oben: r => (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return wackeln([112, 82, 46], 5, r);
      if (x === 5 || x === 10 || y === 5 || y === 10) return wackeln([120, 88, 50], 5, r);
      return wackeln([184, 146, 92], 7, r);
    },
    werkbank_seite: r => (x, y) => {
      if (y < 3) return wackeln([112, 82, 46], 5, r);
      // Saege und Hammer angedeutet
      if (y >= 5 && y <= 6 && x >= 2 && x <= 7) return wackeln([170, 170, 176], 6, r);
      if (x === 11 && y >= 5 && y <= 12) return wackeln([90, 64, 36], 5, r);
      if (y === 5 && x >= 9 && x <= 13) return wackeln([120, 120, 126], 6, r);
      if (y % 4 === 3) return wackeln([112, 82, 46], 5, r);
      return wackeln([168, 130, 78], 7, r);
    },
    buecher: r => {
      const farben = [[150, 40, 40], [40, 80, 150], [50, 120, 60], [140, 110, 40], [100, 50, 120]];
      const reihen = [[], []];
      for (let k = 0; k < 2; k++) { let x = 1; while (x < 15) { const b = 1 + Math.floor(r() * 3); reihen[k].push([x, Math.min(15, x + b), farben[Math.floor(r() * farben.length)]]); x += b; } }
      return (x, y) => {
        if (y === 0 || y === 15 || y === 7 || y === 8) return wackeln([150, 114, 66], 6, r);
        if (x === 0 || x === 15) return wackeln([128, 96, 56], 5, r);
        const reihe = reihen[y < 7 ? 0 : 1];
        for (const [a, b, f] of reihe) if (x >= a && x < b) return wackeln(x === a ? mix(f, [0, 0, 0], 0.3) : f, 6, r);
        return wackeln([60, 40, 24], 4, r);
      };
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

  const mittelfarben = {};
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
  function gegenstandSymbol(form, farbe, groesse) {
    const maske = FORMEN[form];
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(16, 16);
    const voll = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && maske[y][x] !== '.';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const z = maske[y][x], o = (y * 16 + x) * 4;
      let p = null;
      if (z === 'K') { const f = 1.2 - y / 16 * 0.45 - (x / 16) * 0.15; p = [farbe[0] * f, farbe[1] * f, farbe[2] * f, 255]; }
      else if (z === 'S') p = [120 - y * 2, 86 - y * 2, 50, 255];
      else if (z === 'G') p = [70, 150, 50, 255];
      else if (z === 'F') p = [240, 220, 210, 255];
      else if (voll(x - 1, y) || voll(x + 1, y) || voll(x, y - 1) || voll(x, y + 1)) p = [20, 16, 14, 150];
      if (p) { img.data[o] = klemme(p[0]); img.data[o + 1] = klemme(p[1]); img.data[o + 2] = klemme(p[2]); img.data[o + 3] = p[3]; }
    }
    ctx.putImageData(img, 0, 0);
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

  // ---------- Wolken ----------
  function wolken(seed) {
    const N = 64, c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
    const h = (x, y) => { let v = Math.imul(x * 374761393 + y * 668265263 + seed, 1274126177); v ^= v >>> 15; return ((v >>> 0) % 1000) / 1000; };
    const wert = (x, y, f) => {
      const x0 = Math.floor(x / f), y0 = Math.floor(y / f), fx = x / f - x0, fy = y / f - y0, m = N / f;
      const g = (a, b) => h(((a % m) + m) % m, ((b % m) + m) % m);
      const a = g(x0, y0), b = g(x0 + 1, y0), cc = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
      return a + (b - a) * fx + (cc - a) * fy + (a - b - cc + d) * fx * fy;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = wert(x, y, 16) * 0.6 + wert(x, y, 8) * 0.3 + wert(x, y, 4) * 0.1;
      const o = (y * N + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = v > 0.6 ? 220 : 0;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  return { NAMEN, PX, RAND, ZELLE, SPALTEN, ZEILEN, atlas, symbol, flachSymbol, gegenstandSymbol, risse, wolken, mittelfarben, index: n => NAMEN.indexOf(n) };
})();
