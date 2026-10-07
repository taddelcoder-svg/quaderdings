'use strict';
// Quaderland - Gegenstaende, Werkzeuge, Rezepte und Inventar (Ueberlebensmodus).
(function (root, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik(require('./welt'));
  else root.Dinge = fabrik(root.Welt);
})(this, function (W) {
  const MATERIAL = [null,
    { name: 'Holz', farbe: [176, 138, 84], aus: W.BRETTER },
    { name: 'Stein', farbe: [130, 130, 136], aus: W.BRUCH },
    { name: 'Eisen', farbe: [222, 222, 228], aus: W.EISEN },
    { name: 'Diamant', farbe: [90, 230, 220], aus: W.DIAMANT }];
  const TEMPO = [1, 2, 4, 6, 8];
  const HALTBAR = [0, 60, 132, 251, 1562];
  const WERKZEUGE = [
    { basis: 110, typ: 'h', name: 'spitzhacke', titel: 'Spitzhacke', schaden: [0, 2, 3, 4, 5], mat: 3, stoecke: 2 },
    { basis: 120, typ: 'a', name: 'axt', titel: 'Axt', schaden: [0, 3, 4, 5, 6], mat: 3, stoecke: 2 },
    { basis: 130, typ: 's', name: 'schaufel', titel: 'Schaufel', schaden: [0, 2, 2, 3, 4], mat: 1, stoecke: 2 },
    { basis: 140, typ: 'w', name: 'schwert', titel: 'Schwert', schaden: [0, 4, 5, 6, 8], mat: 2, stoecke: 1 }
  ];

  // Infos zu jeder ID: name, stapel, symbol {form, farbe} oder Block, werkzeug, essen
  const INFO = {};
  for (let b = 1; b < W.ANZAHL; b++) INFO[b] = { name: W.TAB[b][0], stapel: 64, block: true };
  INFO[W.STOCK] = { name: 'Stock', stapel: 64, symbol: { form: 'stock', farbe: [0, 0, 0] } };
  INFO[W.KOHLE] = { name: 'Kohle', stapel: 64, symbol: { form: 'klumpen', farbe: [44, 44, 48] } };
  INFO[W.EISEN] = { name: 'Eisen', stapel: 64, symbol: { form: 'barren', farbe: [222, 222, 228] } };
  INFO[W.GOLD] = { name: 'Gold', stapel: 64, symbol: { form: 'barren', farbe: [250, 212, 60] } };
  INFO[W.DIAMANT] = { name: 'Diamant', stapel: 64, symbol: { form: 'diamant', farbe: [100, 236, 228] } };
  INFO[W.APFEL] = { name: 'Apfel', stapel: 64, symbol: { form: 'apfel', farbe: [210, 40, 40] }, essen: 4 };
  INFO[W.FLEISCH] = { name: 'Fleisch', stapel: 64, symbol: { form: 'fleisch', farbe: [190, 90, 80] }, essen: 6 };
  for (const wz of WERKZEUGE) {
    for (let st = 1; st <= 4; st++) {
      INFO[wz.basis + st - 1] = {
        name: wz.titel + ' (' + MATERIAL[st].name + ')', stapel: 1,
        symbol: { form: wz.name, farbe: MATERIAL[st].farbe },
        werkzeug: { typ: wz.typ, stufe: st, tempo: wz.typ === 'w' ? 1 : TEMPO[st], schaden: wz.schaden[st], haltbar: HALTBAR[st] }
      };
    }
  }
  const info = id => INFO[id] || { name: '?', stapel: 64 };
  const werkzeug = id => (INFO[id] && INFO[id].werkzeug) || null;

  // Wie lange dauert das Abbauen, und gibt es Beute?
  function abbau(b, werkzeugId) {
    const t = W.TAB[b];
    const haerte = t[6];
    if (!Number.isFinite(haerte)) return { zeit: Infinity, ernte: false };
    if (haerte === 0) return { zeit: 0, ernte: true };
    const w = werkzeug(werkzeugId);
    const passend = !!(t[7] && w && w.typ === t[7]);
    const ernte = t[8] === 0 || (passend && w.stufe >= t[8]);
    const faktor = passend ? w.tempo : 1;
    return { zeit: haerte * (ernte ? 1.5 : 5) / faktor, ernte };
  }
  function beute(b, ernte, zufall) {
    if (!ernte) return [];
    const r = zufall || Math.random;
    if (b === W.LAUB || b === W.BIRKENLAUB) return r() < 0.06 ? [[W.APFEL, 1]] : [];
    const d = W.TAB[b][9];
    if (d === 0) return [];
    return [[d === -1 ? b : d, 1]];
  }
  function schaden(id) { const w = werkzeug(id); return w ? w.schaden : 1; }

  // ---------- Rezepte ----------
  const REZEPTE = [];
  const rezept = (aus, n, ein, werkbank) => REZEPTE.push({ aus, n, ein, werkbank: !!werkbank });
  rezept(W.BRETTER, 4, [[W.STAMM, 1]]);
  rezept(W.BRETTER, 4, [[W.BIRKE, 1]]);
  rezept(W.STOCK, 4, [[W.BRETTER, 2]]);
  rezept(W.WERKBANK, 1, [[W.BRETTER, 4]]);
  rezept(W.FACKEL, 4, [[W.KOHLE, 1], [W.STOCK, 1]]);
  for (const wz of WERKZEUGE) for (let st = 1; st <= 4; st++) rezept(wz.basis + st - 1, 1, [[MATERIAL[st].aus, wz.mat], [W.STOCK, wz.stoecke]], true);
  rezept(W.SANDSTEIN, 1, [[W.SAND, 4]]);
  rezept(W.STEIN, 4, [[W.BRUCH, 4], [W.KOHLE, 1]], true);
  rezept(W.STEINZIEGEL, 4, [[W.STEIN, 4]], true);
  rezept(W.GLAS, 2, [[W.SAND, 2], [W.KOHLE, 1]], true);
  rezept(W.ZIEGEL, 2, [[W.ERDE, 2], [W.KOHLE, 1]], true);
  rezept(W.LAMPE, 1, [[W.GLAS, 1], [W.FACKEL, 2]], true);
  rezept(W.BUECHER, 1, [[W.BRETTER, 6]], true);
  rezept(W.WOLLE_ROT, 1, [[W.WOLLE_WEISS, 1], [W.BLUME_ROT, 1]]);
  rezept(W.WOLLE_GELB, 1, [[W.WOLLE_WEISS, 1], [W.BLUME_GELB, 1]]);
  rezept(W.WOLLE_BLAU, 1, [[W.WOLLE_WEISS, 1], [W.KORNBLUME, 1]]);
  rezept(W.WOLLE_GRUEN, 1, [[W.WOLLE_WEISS, 1], [W.KAKTUS, 1]]);
  rezept(W.WOLLE_SCHWARZ, 1, [[W.WOLLE_WEISS, 1], [W.KOHLE, 1]]);

  // ---------- Inventar ----------
  // Felder 0..8 sind die Hotbar, 9..35 der Rucksack. Ein Feld: {id, n, abn (Abnutzung)} oder null
  class Inventar {
    constructor(daten) {
      this.f = new Array(36).fill(null);
      if (Array.isArray(daten)) daten.slice(0, 36).forEach((s, i) => { if (s && INFO[s[0]] && s[1] > 0) this.f[i] = { id: s[0], n: Math.min(s[1], info(s[0]).stapel), abn: s[2] || 0 }; });
    }
    daten() { return this.f.map(s => s ? [s.id, s.n, s.abn || 0] : null); }
    anzahl(id) { let n = 0; for (const s of this.f) if (s && s.id === id) n += s.n; return n; }
    platzFuer(id, n) {
      const st = info(id).stapel; let frei = 0;
      for (const s of this.f) { if (!s) frei += st; else if (s.id === id && st > 1) frei += st - s.n; }
      return frei >= n;
    }
    // legt so viel wie moeglich ab, liefert den Rest
    hinzu(id, n, abn) {
      const st = info(id).stapel;
      if (st > 1) for (const s of this.f) { if (n <= 0) break; if (s && s.id === id && s.n < st) { const k = Math.min(n, st - s.n); s.n += k; n -= k; } }
      for (let i = 0; i < this.f.length && n > 0; i++) {
        if (!this.f[i]) { const k = Math.min(n, st); this.f[i] = { id, n: k, abn: abn || 0 }; n -= k; }
      }
      return n;
    }
    entferne(id, n) {
      if (this.anzahl(id) < n) return false;
      for (let i = this.f.length - 1; i >= 0 && n > 0; i--) {
        const s = this.f[i];
        if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (s.n <= 0) this.f[i] = null; }
      }
      return true;
    }
    nimm(i, n) { const s = this.f[i]; if (!s) return; s.n -= n || 1; if (s.n <= 0) this.f[i] = null; }
    // Werkzeug benutzen: Abnutzung erhoehen, bei 0 Haltbarkeit zerbricht es (true)
    abnutzen(i) {
      const s = this.f[i], w = s && werkzeug(s.id);
      if (!w) return false;
      s.abn = (s.abn || 0) + 1;
      if (s.abn >= w.haltbar) { this.f[i] = null; return true; }
      return false;
    }
    // Feld a auf Feld b legen: stapeln, sonst tauschen
    verschiebe(a, b) {
      if (a === b) return;
      const A = this.f[a], B = this.f[b];
      if (A && B && A.id === B.id && info(A.id).stapel > 1) {
        const k = Math.min(A.n, info(B.id).stapel - B.n);
        B.n += k; A.n -= k; if (A.n <= 0) this.f[a] = null;
        return;
      }
      this.f[a] = B; this.f[b] = A;
    }
    kannHerstellen(r) { return r.ein.every(([id, n]) => this.anzahl(id) >= n); }
    herstellen(r) {
      if (!this.kannHerstellen(r)) return false;
      // Platz pruefen: nach dem Entfernen der Zutaten
      const probe = new Inventar(this.daten());
      for (const [id, n] of r.ein) probe.entferne(id, n);
      if (!probe.platzFuer(r.aus, r.n)) return false;
      for (const [id, n] of r.ein) this.entferne(id, n);
      this.hinzu(r.aus, r.n);
      return true;
    }
  }

  return { INFO, info, werkzeug, abbau, beute, schaden, REZEPTE, Inventar, MATERIAL };
});
