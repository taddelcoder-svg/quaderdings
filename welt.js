'use strict';
// Quaderland - gemeinsame Weltregeln fuer Browser und Server:
// Bloecke, Rauschen und Gelaendeerzeugung. Alles ist rein und von der Zahl "seed" abhaengig,
// darum muss der Server nur die Aenderungen der Spieler speichern, nie die Welt selbst.
(function (root, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else root.Welt = fabrik();
})(this, function () {
  const CX = 16;        // Chunk-Breite
  const CH = 64;        // Welthoehe
  const MEER = 16;      // Wasserspiegel

  const LUFT = 0, GRAS = 1, ERDE = 2, STEIN = 3, SAND = 4, WASSER = 5, STAMM = 6, LAUB = 7, BRETTER = 8,
    BRUCH = 9, SCHNEE = 10, GLAS = 11, ZIEGEL = 12, GRUND = 13, LAMPE = 14, WOLLE_ROT = 15, WOLLE_BLAU = 16,
    WOLLE_GELB = 17, WOLLE_GRUEN = 18, WOLLE_WEISS = 19, WOLLE_SCHWARZ = 20;

  // [Name, Kachel oben, unten, Seite, Art]  Art: o = undurchsichtig, d = durchsichtig/ausgeschnitten, w = Wasser
  const TAB = [
    ['Luft', null, null, null, 'd'],
    ['Gras', 'gras_oben', 'erde', 'gras_seite', 'o'],
    ['Erde', 'erde', 'erde', 'erde', 'o'],
    ['Stein', 'stein', 'stein', 'stein', 'o'],
    ['Sand', 'sand', 'sand', 'sand', 'o'],
    ['Wasser', 'wasser', 'wasser', 'wasser', 'w'],
    ['Holz', 'stamm_oben', 'stamm_oben', 'stamm_seite', 'o'],
    ['Blätter', 'laub', 'laub', 'laub', 'o'],
    ['Bretter', 'bretter', 'bretter', 'bretter', 'o'],
    ['Bruchstein', 'bruch', 'bruch', 'bruch', 'o'],
    ['Schnee', 'schnee', 'erde', 'schnee_seite', 'o'],
    ['Glas', 'glas', 'glas', 'glas', 'd'],
    ['Ziegel', 'ziegel', 'ziegel', 'ziegel', 'o'],
    ['Grundgestein', 'grund', 'grund', 'grund', 'o'],
    ['Lampe', 'lampe', 'lampe', 'lampe', 'o'],
    ['Rote Wolle', 'wolle_rot', 'wolle_rot', 'wolle_rot', 'o'],
    ['Blaue Wolle', 'wolle_blau', 'wolle_blau', 'wolle_blau', 'o'],
    ['Gelbe Wolle', 'wolle_gelb', 'wolle_gelb', 'wolle_gelb', 'o'],
    ['Grüne Wolle', 'wolle_gruen', 'wolle_gruen', 'wolle_gruen', 'o'],
    ['Weiße Wolle', 'wolle_weiss', 'wolle_weiss', 'wolle_weiss', 'o'],
    ['Schwarze Wolle', 'wolle_schwarz', 'wolle_schwarz', 'wolle_schwarz', 'o']
  ];
  const ANZAHL = TAB.length;
  const OPAK = new Uint8Array(ANZAHL), FEST = new Uint8Array(ANZAHL);
  for (let i = 0; i < ANZAHL; i++) {
    OPAK[i] = TAB[i][4] === 'o' ? 1 : 0;
    FEST[i] = (i !== LUFT && i !== WASSER) ? 1 : 0;
  }
  // Was Spieler setzen duerfen (alles ausser Luft, Wasser, Grundgestein)
  const PLATZIERBAR = [];
  for (let i = 1; i < ANZAHL; i++) if (i !== WASSER && i !== GRUND) PLATZIERBAR.push(i);

  // ---------- Rauschen ----------
  function hash(x, z, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function hash3(x, y, z, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 1103515245) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const glatt = t => t * t * (3 - 2 * t);
  function rausch2(x, z, s) {
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = glatt(x - x0), fz = glatt(z - z0);
    const a = hash(x0, z0, s), b = hash(x0 + 1, z0, s), c = hash(x0, z0 + 1, s), d = hash(x0 + 1, z0 + 1, s);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }
  function rausch3(x, y, z, s) {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const fx = glatt(x - x0), fy = glatt(y - y0), fz = glatt(z - z0);
    const l = (a, b, t) => a + (b - a) * t;
    const a = l(hash3(x0, y0, z0, s), hash3(x0 + 1, y0, z0, s), fx);
    const b = l(hash3(x0, y0 + 1, z0, s), hash3(x0 + 1, y0 + 1, z0, s), fx);
    const c = l(hash3(x0, y0, z0 + 1, s), hash3(x0 + 1, y0, z0 + 1, s), fx);
    const d = l(hash3(x0, y0 + 1, z0 + 1, s), hash3(x0 + 1, y0 + 1, z0 + 1, s), fx);
    return l(l(a, b, fy), l(c, d, fy), fz);
  }
  function fbm2(x, z, s, okt) {
    let summe = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < okt; i++) { summe += rausch2(x * f, z * f, s + i * 101) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return summe / norm;
  }

  // ---------- Gelaende ----------
  function hoehe(x, z, seed) {
    const basis = fbm2(x * 0.006, z * 0.006, seed, 4);
    const berg = Math.max(0, fbm2(x * 0.0035 + 50, z * 0.0035 - 30, seed + 7, 3) - 0.52) * 2.2;
    const h = 19 + (basis - 0.5) * 48 + berg * berg * 60 + (rausch2(x * 0.08, z * 0.08, seed + 3) - 0.5) * 3;
    return Math.max(2, Math.min(CH - 8, Math.floor(h)));
  }
  const istWueste = (x, z, seed) => fbm2(x * 0.0025 - 70, z * 0.0025 + 20, seed + 11, 2) > 0.6;
  // Oberflaechenblock einer Spalte
  function oberflaeche(x, z, seed, h) {
    if (h <= MEER + 1) return SAND;
    if (h >= 41) return SCHNEE;
    if (h >= 37) return STEIN;
    if (istWueste(x, z, seed)) return SAND;
    return GRAS;
  }
  function hoehle(x, y, z, seed) {
    const n = rausch3(x * 0.06, y * 0.09, z * 0.06, seed + 5) * 0.65 + rausch3(x * 0.13, y * 0.19, z * 0.13, seed + 6) * 0.35;
    return n > 0.665;
  }
  // Hoehe des Baums an dieser Stelle (0 = kein Baum)
  function baumHoehe(x, z, seed, h, ob) {
    if (ob !== GRAS || h <= MEER + 1 || h > 36) return 0;
    if (hash(x, z, seed + 99) >= 0.014) return 0;
    return 4 + Math.floor(hash(x, z, seed + 98) * 3);
  }

  function chunkErzeugen(seed, cx, cz) {
    const d = new Uint8Array(CX * CX * CH);
    const x0 = cx * CX, z0 = cz * CX;
    for (let lz = 0; lz < CX; lz++) {
      for (let lx = 0; lx < CX; lx++) {
        const wx = x0 + lx, wz = z0 + lz;
        const h = hoehe(wx, wz, seed), ob = oberflaeche(wx, wz, seed, h);
        const sandig = ob === SAND;
        for (let y = 0; y <= h; y++) {
          let b;
          if (y === 0) b = GRUND;
          else if (y < h - 3) b = (y > 2 && hoehle(wx, y, wz, seed)) ? LUFT : STEIN;
          else if (y === h) b = ob;
          else b = sandig ? SAND : (ob === STEIN || ob === SCHNEE ? STEIN : ERDE);
          d[lx + lz * CX + y * CX * CX] = b;
        }
        for (let y = h + 1; y <= MEER; y++) d[lx + lz * CX + y * CX * CX] = WASSER;
      }
    }
    // Baeume (auch die aus Nachbar-Chunks, deren Krone hereinragt)
    for (let tz = z0 - 2; tz < z0 + CX + 2; tz++) {
      for (let tx = x0 - 2; tx < x0 + CX + 2; tx++) {
        const h = hoehe(tx, tz, seed), ob = oberflaeche(tx, tz, seed, h);
        const bh = baumHoehe(tx, tz, seed, h, ob);
        if (!bh) continue;
        const setze = (x, y, z, b, nurLuft) => {
          const lx = x - x0, lz = z - z0;
          if (lx < 0 || lx >= CX || lz < 0 || lz >= CX || y < 0 || y >= CH) return;
          const i = lx + lz * CX + y * CX * CX;
          if (nurLuft && d[i] !== LUFT) return;
          d[i] = b;
        };
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = bh - 2; dy <= bh + 1; dy++) {
              const r2 = dx * dx + dz * dz;
              const oben = dy === bh + 1;
              if (oben ? r2 > 2 : (dy === bh ? r2 > 5 : r2 > 8)) continue;
              if (dx === 0 && dz === 0 && dy <= bh) continue;
              setze(tx + dx, h + dy, tz + dz, LAUB, true);
            }
          }
        }
        for (let dy = 1; dy <= bh; dy++) setze(tx, h + dy, tz, STAMM, false);
      }
    }
    return d;
  }

  // Ein Startpunkt auf Land (Spalte in Weltkoordinaten); Hoehe bestimmt der Client aus den Chunk-Daten
  function startpunkt(seed) {
    for (let r = 0; r < 600; r += 5) {
      for (let k = 0; k < 8; k++) {
        const x = Math.round(Math.cos(k * Math.PI / 4) * r), z = Math.round(Math.sin(k * Math.PI / 4) * r);
        const h = hoehe(x, z, seed);
        if (h > MEER + 1 && h < 30 && oberflaeche(x, z, seed, h) !== SAND) return { x, z };
      }
    }
    return { x: 0, z: 0 };
  }

  return {
    CX, CH, MEER, ANZAHL, TAB, OPAK, FEST, PLATZIERBAR,
    LUFT, GRAS, ERDE, STEIN, SAND, WASSER, STAMM, LAUB, BRETTER, BRUCH, SCHNEE, GLAS, ZIEGEL, GRUND, LAMPE,
    WOLLE_ROT, WOLLE_BLAU, WOLLE_GELB, WOLLE_GRUEN, WOLLE_WEISS, WOLLE_SCHWARZ,
    hash, rausch2, fbm2, hoehe, chunkErzeugen, startpunkt
  };
});
