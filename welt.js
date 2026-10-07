'use strict';
// Quaderland - gemeinsame Weltregeln fuer Browser und Server:
// Bloecke, Rauschen, Gelaendeerzeugung, Tageszeit und Koerper-Physik.
// Die Welt ist rein von der Zahl "seed" abhaengig, darum muss der Server nur die
// Aenderungen der Spieler speichern, nie die Welt selbst.
(function (root, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else root.Welt = fabrik();
})(this, function () {
  const CX = 16;        // Chunk-Breite
  const CH = 64;        // Welthoehe
  const MEER = 16;      // Wasserspiegel
  const DAUER = 480;    // Sekunden pro Tag

  // Block-IDs: bestehende Nummern nie aendern (stehen in gespeicherten Welten)
  const LUFT = 0, GRAS = 1, ERDE = 2, STEIN = 3, SAND = 4, WASSER = 5, STAMM = 6, LAUB = 7, BRETTER = 8,
    BRUCH = 9, SCHNEE = 10, GLAS = 11, ZIEGEL = 12, GRUND = 13, LAMPE = 14, WOLLE_ROT = 15, WOLLE_BLAU = 16,
    WOLLE_GELB = 17, WOLLE_GRUEN = 18, WOLLE_WEISS = 19, WOLLE_SCHWARZ = 20,
    HOHESGRAS = 21, BLUME_ROT = 22, BLUME_GELB = 23, KORNBLUME = 24, FACKEL = 25,
    KOHLEERZ = 26, EISENERZ = 27, GOLDERZ = 28, DIAMANTERZ = 29, KIES = 30, SANDSTEIN = 31, STEINZIEGEL = 32,
    BIRKE = 33, BIRKENLAUB = 34, KAKTUS = 35, WERKBANK = 36, BUECHER = 37;

  // Gegenstaende, die keine Bloecke sind (IDs ab 100) - Namen hier, Rest in dinge.js
  const STOCK = 100, KOHLE = 101, EISEN = 102, GOLD = 103, DIAMANT = 104, APFEL = 105, FLEISCH = 106;

  // Spalten: Name, Kachel oben, unten, Seite, Art, Form, Haerte (s), Werkzeug, Stufe, Beute, Licht
  //  Art:   o = undurchsichtig, d = durchsichtig (ausgeschnitten), w = Wasser, p = Pflanze/Deko (nicht fest)
  //  Form:  w = Wuerfel, x = Kreuz (Pflanzen), f = Fackel
  //  Werkzeug: h = Spitzhacke, a = Axt, s = Schaufel, '' = egal.  Stufe: noetige Werkzeugstufe fuer Beute (1 Holz .. 4 Diamant)
  //  Beute: -1 = der Block selbst, 0 = nichts, sonst ID
  const TAB = [
    ['Luft', null, null, null, 'd', 'w', 0, '', 0, 0, 0],
    ['Gras', 'gras_oben', 'erde', 'gras_seite', 'o', 'w', 0.6, 's', 0, ERDE, 0],
    ['Erde', 'erde', 'erde', 'erde', 'o', 'w', 0.5, 's', 0, -1, 0],
    ['Stein', 'stein', 'stein', 'stein', 'o', 'w', 1.5, 'h', 1, BRUCH, 0],
    ['Sand', 'sand', 'sand', 'sand', 'o', 'w', 0.5, 's', 0, -1, 0],
    ['Wasser', 'wasser', 'wasser', 'wasser', 'w', 'w', 0, '', 0, 0, 0],
    ['Holz', 'stamm_oben', 'stamm_oben', 'stamm_seite', 'o', 'w', 2, 'a', 0, -1, 0],
    ['Blätter', 'laub', 'laub', 'laub', 'o', 'w', 0.2, '', 0, 0, 0],
    ['Bretter', 'bretter', 'bretter', 'bretter', 'o', 'w', 2, 'a', 0, -1, 0],
    ['Bruchstein', 'bruch', 'bruch', 'bruch', 'o', 'w', 2, 'h', 1, -1, 0],
    ['Schnee', 'schnee', 'erde', 'schnee_seite', 'o', 'w', 0.4, 's', 0, -1, 0],
    ['Glas', 'glas', 'glas', 'glas', 'd', 'w', 0.3, '', 0, 0, 0],
    ['Ziegel', 'ziegel', 'ziegel', 'ziegel', 'o', 'w', 2, 'h', 1, -1, 0],
    ['Grundgestein', 'grund', 'grund', 'grund', 'o', 'w', Infinity, '', 9, 0, 0],
    ['Lampe', 'lampe', 'lampe', 'lampe', 'o', 'w', 0.3, '', 0, -1, 15],
    ['Rote Wolle', 'wolle_rot', 'wolle_rot', 'wolle_rot', 'o', 'w', 0.8, '', 0, -1, 0],
    ['Blaue Wolle', 'wolle_blau', 'wolle_blau', 'wolle_blau', 'o', 'w', 0.8, '', 0, -1, 0],
    ['Gelbe Wolle', 'wolle_gelb', 'wolle_gelb', 'wolle_gelb', 'o', 'w', 0.8, '', 0, -1, 0],
    ['Grüne Wolle', 'wolle_gruen', 'wolle_gruen', 'wolle_gruen', 'o', 'w', 0.8, '', 0, -1, 0],
    ['Weiße Wolle', 'wolle_weiss', 'wolle_weiss', 'wolle_weiss', 'o', 'w', 0.8, '', 0, -1, 0],
    ['Schwarze Wolle', 'wolle_schwarz', 'wolle_schwarz', 'wolle_schwarz', 'o', 'w', 0.8, '', 0, -1, 0],
    ['Hohes Gras', 'hohesgras', 'hohesgras', 'hohesgras', 'p', 'x', 0, '', 0, 0, 0],
    ['Mohn', 'blume_rot', 'blume_rot', 'blume_rot', 'p', 'x', 0, '', 0, -1, 0],
    ['Löwenzahn', 'blume_gelb', 'blume_gelb', 'blume_gelb', 'p', 'x', 0, '', 0, -1, 0],
    ['Kornblume', 'kornblume', 'kornblume', 'kornblume', 'p', 'x', 0, '', 0, -1, 0],
    ['Fackel', 'fackel', 'fackel', 'fackel', 'p', 'f', 0, '', 0, -1, 14],
    ['Kohleerz', 'kohleerz', 'kohleerz', 'kohleerz', 'o', 'w', 3, 'h', 1, KOHLE, 0],
    ['Eisenerz', 'eisenerz', 'eisenerz', 'eisenerz', 'o', 'w', 3, 'h', 2, EISEN, 0],
    ['Golderz', 'golderz', 'golderz', 'golderz', 'o', 'w', 3, 'h', 3, GOLD, 0],
    ['Diamanterz', 'diamanterz', 'diamanterz', 'diamanterz', 'o', 'w', 3, 'h', 3, DIAMANT, 0],
    ['Kies', 'kies', 'kies', 'kies', 'o', 'w', 0.6, 's', 0, -1, 0],
    ['Sandstein', 'sandstein_oben', 'sandstein_oben', 'sandstein_seite', 'o', 'w', 0.8, 'h', 1, -1, 0],
    ['Steinziegel', 'steinziegel', 'steinziegel', 'steinziegel', 'o', 'w', 1.5, 'h', 1, -1, 0],
    ['Birkenholz', 'birke_oben', 'birke_oben', 'birke_seite', 'o', 'w', 2, 'a', 0, -1, 0],
    ['Birkenblätter', 'birkenlaub', 'birkenlaub', 'birkenlaub', 'o', 'w', 0.2, '', 0, 0, 0],
    ['Kaktus', 'kaktus_oben', 'kaktus_oben', 'kaktus_seite', 'o', 'w', 0.4, '', 0, -1, 0],
    ['Werkbank', 'werkbank_oben', 'bretter', 'werkbank_seite', 'o', 'w', 2.5, 'a', 0, -1, 0],
    ['Bücherregal', 'bretter', 'bretter', 'buecher', 'o', 'w', 1.5, 'a', 0, -1, 0]
  ];
  const ANZAHL = TAB.length;
  const OPAK = new Uint8Array(ANZAHL), FEST = new Uint8Array(ANZAHL), LICHT = new Uint8Array(ANZAHL);
  // Wie stark Licht beim Durchgang zusaetzlich geschwaecht wird (255 = sperrt)
  const DAEMPFUNG = new Uint8Array(ANZAHL);
  const PFLANZE = new Uint8Array(ANZAHL);
  for (let i = 0; i < ANZAHL; i++) {
    const art = TAB[i][4];
    OPAK[i] = art === 'o' ? 1 : 0;
    FEST[i] = (i !== LUFT && (art === 'o' || art === 'd')) ? 1 : 0;
    LICHT[i] = TAB[i][10];
    PFLANZE[i] = art === 'p' ? 1 : 0;
    DAEMPFUNG[i] = art === 'o' ? 255 : art === 'w' ? 2 : 0;
  }
  // Laub laesst Licht gedaempft durch, damit Waelder nicht stockdunkel sind
  OPAK[LAUB] = 1; DAEMPFUNG[LAUB] = 1; DAEMPFUNG[BIRKENLAUB] = 1;
  // Was Spieler setzen duerfen (alles ausser Luft, Wasser, Grundgestein)
  const PLATZIERBAR = [];
  for (let i = 1; i < ANZAHL; i++) if (i !== WASSER && i !== GRUND) PLATZIERBAR.push(i);
  // Pflanzen und Fackeln brauchen festen Boden darunter
  const BRAUCHT_BODEN = new Uint8Array(ANZAHL);
  for (const b of [HOHESGRAS, BLUME_ROT, BLUME_GELB, KORNBLUME, FACKEL]) BRAUCHT_BODEN[b] = 1;

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
  const waldDichte = (x, z, seed) => fbm2(x * 0.004 + 300, z * 0.004 - 120, seed + 13, 2);
  const istBirkenwald = (x, z, seed) => fbm2(x * 0.003 - 400, z * 0.003 + 90, seed + 17, 2) > 0.57;
  // Oberflaechenblock einer Spalte
  function oberflaeche(x, z, seed, h) {
    if (h <= MEER + 1) return (h < MEER - 2 && rausch2(x * 0.1, z * 0.1, seed + 21) > 0.62) ? KIES : SAND;
    if (h >= 41) return SCHNEE;
    if (h >= 37) return STEIN;
    if (istWueste(x, z, seed)) return SAND;
    return GRAS;
  }
  function hoehle(x, y, z, seed) {
    const n = rausch3(x * 0.06, y * 0.09, z * 0.06, seed + 5) * 0.65 + rausch3(x * 0.13, y * 0.19, z * 0.13, seed + 6) * 0.35;
    return n > 0.665;
  }
  function erz(x, y, z, seed) {
    // Kohle und Eisen in kleinen Adern (2x2x2-Zellen), Gold und Diamant einzeln und tief
    if (y < 12 && hash3(x, y, z, seed + 34) < 0.001) return DIAMANTERZ;
    if (y < 24 && hash3(x, y, z, seed + 33) < 0.002) return GOLDERZ;
    if (y < 44 && hash3(x >> 1, y >> 1, z >> 1, seed + 32) < 0.0075 && hash3(x, y, z, seed + 35) < 0.6) return EISENERZ;
    if (hash3(x >> 1, y >> 1, z >> 1, seed + 31) < 0.014 && hash3(x, y, z, seed + 36) < 0.65) return KOHLEERZ;
    return STEIN;
  }
  // Baum an dieser Stelle? 0 = keiner, sonst Stammhoehe; Art ueber baumArt()
  function baumHoehe(x, z, seed, h, ob) {
    if (ob !== GRAS || h <= MEER + 1 || h > 36) return 0;
    const p = 0.003 + waldDichte(x, z, seed) * waldDichte(x, z, seed) * 0.06;
    if (hash(x, z, seed + 99) >= p) return 0;
    return 4 + Math.floor(hash(x, z, seed + 98) * 3);
  }
  const baumIstBirke = (x, z, seed) => istBirkenwald(x, z, seed) || hash(x, z, seed + 97) < 0.12;

  function chunkErzeugen(seed, cx, cz) {
    const d = new Uint8Array(CX * CX * CH);
    const x0 = cx * CX, z0 = cz * CX;
    for (let lz = 0; lz < CX; lz++) {
      for (let lx = 0; lx < CX; lx++) {
        const wx = x0 + lx, wz = z0 + lz;
        const h = hoehe(wx, wz, seed), ob = oberflaeche(wx, wz, seed, h);
        const sandig = ob === SAND || ob === KIES;
        const wueste = ob === SAND && h > MEER + 1;
        for (let y = 0; y <= h; y++) {
          let b;
          if (y === 0) b = GRUND;
          else if (y < h - 3) b = (y > 2 && hoehle(wx, y, wz, seed)) ? LUFT : erz(wx, y, wz, seed);
          else if (y === h) b = ob;
          else if (wueste) b = y < h - 1 ? SANDSTEIN : SAND;
          else b = sandig ? ob : (ob === STEIN || ob === SCHNEE ? STEIN : ERDE);
          d[lx + lz * CX + y * CX * CX] = b;
        }
        for (let y = h + 1; y <= MEER; y++) d[lx + lz * CX + y * CX * CX] = WASSER;
        // Pflanzen auf Gras, Kakteen in der Wueste
        if (h + 1 < CH && h > MEER) {
          const i = lx + lz * CX + (h + 1) * CX * CX;
          if (ob === GRAS) {
            const r = hash(wx, wz, seed + 50);
            if (r < 0.012) d[i] = [BLUME_ROT, BLUME_GELB, KORNBLUME][Math.floor(hash(wx, wz, seed + 51) * 3)];
            else if (r < 0.012 + 0.11 * (0.4 + waldDichte(wx, wz, seed))) d[i] = HOHESGRAS;
          } else if (wueste && hash(wx, wz, seed + 52) < 0.005) {
            const kh = 1 + Math.floor(hash(wx, wz, seed + 53) * 3);
            for (let k = 0; k < kh && h + 1 + k < CH; k++) d[i + k * CX * CX] = KAKTUS;
          }
        }
      }
    }
    // Baeume (auch die aus Nachbar-Chunks, deren Krone hereinragt)
    for (let tz = z0 - 2; tz < z0 + CX + 2; tz++) {
      for (let tx = x0 - 2; tx < x0 + CX + 2; tx++) {
        const h = hoehe(tx, tz, seed), ob = oberflaeche(tx, tz, seed, h);
        const bh = baumHoehe(tx, tz, seed, h, ob);
        if (!bh) continue;
        const birke = baumIstBirke(tx, tz, seed);
        const stamm = birke ? BIRKE : STAMM, laub = birke ? BIRKENLAUB : LAUB;
        const setze = (x, y, z, b, ueberschreiben) => {
          const lx = x - x0, lz = z - z0;
          if (lx < 0 || lx >= CX || lz < 0 || lz >= CX || y < 0 || y >= CH) return;
          const i = lx + lz * CX + y * CX * CX;
          if (!ueberschreiben && d[i] !== LUFT && !PFLANZE[d[i]]) return;
          d[i] = b;
        };
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = bh - 2; dy <= bh + 1; dy++) {
              const r2 = dx * dx + dz * dz;
              const oben = dy === bh + 1;
              if (oben ? r2 > 2 : (dy === bh ? r2 > 5 : r2 > 8)) continue;
              if (dx === 0 && dz === 0 && dy <= bh) continue;
              setze(tx + dx, h + dy, tz + dz, laub, false);
            }
          }
        }
        for (let dy = 1; dy <= bh; dy++) setze(tx, h + dy, tz, stamm, true);
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

  // ---------- Tageszeit ----------
  // phase 0..1 (0 = Sonnenaufgang, 0.25 = Mittag, 0.75 = Mitternacht) -> Tageslicht 0..1
  function tageslicht(phase) {
    const h = Math.sin(phase * Math.PI * 2);
    const t = Math.max(0, Math.min(1, (h + 0.12) / 0.4));
    return t * t * (3 - 2 * t);
  }
  const phaseAusZeit = ms => ((ms / 1000) % DAUER) / DAUER;

  // ---------- Koerper-Physik (Spieler und Tiere) ----------
  // k: {x,y,z,vx,vy,vz,boden}, groesse: {b (halbe Breite), h}
  function kollidiert(getBlock, x, y, z, b, h) {
    const x0 = Math.floor(x - b), x1 = Math.floor(x + b), y0 = Math.floor(y), y1 = Math.floor(y + h - 0.001);
    const z0 = Math.floor(z - b), z1 = Math.floor(z + b);
    for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) if (FEST[getBlock(bx, by, bz)]) return true;
    return false;
  }
  // bewegt den Koerper um v*dt; liefert {gestossen: true, wenn seitlich blockiert, fall: Fallhoehe beim Aufkommen}
  function bewege(getBlock, k, dt, b, h) {
    let gestossen = false, fall = 0;
    const nx = k.x + k.vx * dt;
    if (!kollidiert(getBlock, nx, k.y, k.z, b, h)) k.x = nx; else { k.vx = 0; gestossen = true; }
    const nz = k.z + k.vz * dt;
    if (!kollidiert(getBlock, k.x, k.y, nz, b, h)) k.z = nz; else { k.vz = 0; gestossen = true; }
    const ny = k.y + k.vy * dt;
    const warBoden = k.boden;
    k.boden = false;
    if (!kollidiert(getBlock, k.x, ny, k.z, b, h)) {
      k.y = ny;
      if (k.vy < 0 && k.fallStart === undefined) k.fallStart = k.y;
      if (k.vy >= 0) k.fallStart = undefined;
    } else {
      if (k.vy < 0) {
        k.y = Math.floor(ny) + 1 + 1e-4; k.boden = true;
        if (!warBoden && k.fallStart !== undefined) fall = k.fallStart - k.y;
        k.fallStart = undefined;
      } else k.y = Math.floor(ny + h) - h - 1e-4;
      k.vy = 0;
    }
    return { gestossen, fall };
  }
  function oberster(getBlock, x, z) {
    for (let y = CH - 1; y > 0; y--) { const b = getBlock(x, y, z); if (b !== 0 && !PFLANZE[b]) return y; }
    return 0;
  }

  return {
    CX, CH, MEER, DAUER, ANZAHL, TAB, OPAK, FEST, LICHT, DAEMPFUNG, PFLANZE, BRAUCHT_BODEN, PLATZIERBAR,
    LUFT, GRAS, ERDE, STEIN, SAND, WASSER, STAMM, LAUB, BRETTER, BRUCH, SCHNEE, GLAS, ZIEGEL, GRUND, LAMPE,
    WOLLE_ROT, WOLLE_BLAU, WOLLE_GELB, WOLLE_GRUEN, WOLLE_WEISS, WOLLE_SCHWARZ,
    HOHESGRAS, BLUME_ROT, BLUME_GELB, KORNBLUME, FACKEL, KOHLEERZ, EISENERZ, GOLDERZ, DIAMANTERZ, KIES,
    SANDSTEIN, STEINZIEGEL, BIRKE, BIRKENLAUB, KAKTUS, WERKBANK, BUECHER,
    STOCK, KOHLE, EISEN, GOLD, DIAMANT, APFEL, FLEISCH,
    hash, hash3, rausch2, fbm2, hoehe, chunkErzeugen, startpunkt, tageslicht, phaseAusZeit,
    kollidiert, bewege, oberster
  };
});
