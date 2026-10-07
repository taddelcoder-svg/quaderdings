'use strict';
// Quaderland - Tiere und Monster. Laeuft online auf dem Server und alleine im Browser.
// Kennt die Welt nur ueber getBlock(x, y, z).
(function (root, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik(require('./welt'));
  else root.Tiere = fabrik(root.Welt);
})(this, function (W) {
  const ARTEN = {
    schaf: { nr: 0, hp: 8, b: 0.42, h: 1.25, tempo: 1.1, beute: r => [[W.WOLLE_WEISS, 1 + (r() < 0.5 ? 1 : 0)], [W.FLEISCH, 1]] },
    schwein: { nr: 1, hp: 10, b: 0.42, h: 0.9, tempo: 1.2, beute: r => [[W.FLEISCH, 1 + Math.floor(r() * 3)]] },
    huhn: { nr: 2, hp: 4, b: 0.25, h: 0.7, tempo: 1.0, beute: r => [[W.FLEISCH, 1]] },
    zombie: { nr: 3, hp: 20, b: 0.3, h: 1.9, tempo: 2.1, feind: true, schaden: 3, beute: r => (r() < 0.15 ? [[W.EISEN, 1]] : []) }
  };
  const ART_LISTE = ['schaf', 'schwein', 'huhn', 'zombie'];
  const MAX_TIERE = 50;

  class Tiere {
    constructor(getBlock, zufall) {
      this.get = getBlock;
      this.r = zufall || Math.random;
      this.m = new Map();
      this.naechste = 1;
      this.spawnUhr = 0;
    }
    neu(art, x, y, z) {
      const a = ARTEN[art];
      const t = { id: this.naechste++, art, x, y, z, vx: 0, vy: 0, vz: 0, ry: this.r() * 6.28, hp: a.hp, boden: false,
        wt: this.r() * 3, wdx: 0, wdz: 0, panik: 0, px: 0, pz: 0, cd: 0, verletzt: 0, brenn: 0 };
      this.m.set(t.id, t);
      return t;
    }
    himmel(t) {
      for (let y = Math.floor(t.y + 2); y < W.CH; y++) if (W.OPAK[this.get(Math.floor(t.x), y, Math.floor(t.z))]) return false;
      return true;
    }
    // spieler: [{id, x, y, z, ueberleben, lebend}], tag: Tageslicht 0..1
    // liefert Ereignisse: {t: 'angriff', ziel, s, x, z}
    schritt(dt, spieler, tag) {
      const ereignisse = [];
      const r = this.r;
      for (const t of this.m.values()) {
        const a = ARTEN[t.art];
        let wx = 0, wz = 0, tempo = a.tempo, jagd = false;
        if (a.feind) {
          let best = null, bd = 24 * 24;
          for (const p of spieler) {
            if (!p.ueberleben || !p.lebend) continue;
            const d = (p.x - t.x) ** 2 + (p.z - t.z) ** 2;
            if (d < bd && Math.abs(p.y - t.y) < 10) { bd = d; best = p; }
          }
          if (best) {
            jagd = true;
            const d = Math.sqrt(bd) || 1;
            wx = (best.x - t.x) / d; wz = (best.z - t.z) / d;
            if (d < 1.1) { wx = wz = 0; }
            t.cd -= dt;
            if (d < 1.6 && Math.abs(best.y - t.y) < 1.6 && t.cd <= 0) {
              t.cd = 1;
              ereignisse.push({ t: 'angriff', ziel: best.id, s: a.schaden, x: t.x, z: t.z });
            }
          }
        }
        if (t.panik > 0) {
          t.panik -= dt;
          const dx = t.x - t.px, dz = t.z - t.pz, d = Math.hypot(dx, dz) || 1;
          wx = dx / d; wz = dz / d; tempo *= 2.2;
        } else if (!jagd) {
          t.wt -= dt;
          if (t.wt <= 0) {
            t.wt = 2 + r() * 5;
            if (r() < 0.45) { t.wdx = t.wdz = 0; } else { const w = r() * Math.PI * 2; t.wdx = Math.cos(w); t.wdz = Math.sin(w); }
          }
          wx = t.wdx; wz = t.wdz;
        }
        const k = Math.min(1, (t.boden ? 8 : 2) * dt);
        t.vx += (wx * tempo - t.vx) * k; t.vz += (wz * tempo - t.vz) * k;
        // Physik in kleinen Schritten, damit auch der Server-Takt (bis 0,2 s) niemanden durch den Boden fallen laesst
        const n = Math.max(1, Math.ceil(dt / 0.04)), h = dt / n;
        for (let s = 0; s < n; s++) {
          const imWasser = this.get(Math.floor(t.x), Math.floor(t.y + 0.4), Math.floor(t.z)) === W.WASSER;
          if (imWasser) t.vy += (2 - t.vy) * Math.min(1, 5 * h);
          else t.vy = Math.max(-40, t.vy - 28 * h);
          const erg = W.bewege(this.get, t, h, a.b, a.h);
          if (erg.gestossen && t.boden && (Math.abs(wx) + Math.abs(wz)) > 0.1) t.vy = 8.4;
        }
        const v = Math.hypot(t.vx, t.vz);
        if (v > 0.15) {
          let d = Math.atan2(-t.vx, -t.vz) - t.ry;
          while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
          t.ry += d * Math.min(1, 8 * dt);
        }
        if (t.verletzt > 0) t.verletzt -= dt;
        if (a.feind && tag > 0.6) {
          t.brenn += dt;
          if (t.brenn >= 1) { t.brenn = 0; if (this.himmel(t)) { t.hp -= 3; t.verletzt = 0.3; } }
        }
        if (t.hp <= 0 || t.y < -20) this.m.delete(t.id);
      }

      // Erscheinen und Verschwinden, einmal pro Sekunde
      this.spawnUhr -= dt;
      if (this.spawnUhr <= 0) {
        this.spawnUhr = 1;
        for (const t of [...this.m.values()]) {
          let nah = false;
          for (const p of spieler) if ((p.x - t.x) ** 2 + (p.z - t.z) ** 2 < 96 * 96) { nah = true; break; }
          if (!nah) this.m.delete(t.id);
        }
        for (const p of spieler) {
          if (this.m.size >= MAX_TIERE) break;
          let tiere = 0, zombies = 0;
          for (const t of this.m.values()) {
            const d = (p.x - t.x) ** 2 + (p.z - t.z) ** 2;
            if (ARTEN[t.art].feind) { if (d < 40 * 40) zombies++; } else if (d < 48 * 48) tiere++;
          }
          if (tiere < 5 && r() < 0.5) for (let v = 0; v < 4 && !this.spawne(p, spieler, false); v++);
          if (p.ueberleben && p.lebend && tag < 0.25 && zombies < 4 && r() < 0.3) for (let v = 0; v < 4 && !this.spawne(p, spieler, true); v++);
        }
      }
      return ereignisse;
    }
    spawne(p, spieler, feind) {
      const r = this.r;
      const w = r() * Math.PI * 2, d = (feind ? 18 : 20) + r() * (feind ? 14 : 20);
      const x = Math.floor(p.x + Math.cos(w) * d), z = Math.floor(p.z + Math.sin(w) * d);
      for (const q of spieler) if ((q.x - x) ** 2 + (q.z - z) ** 2 < 14 * 14) return false;
      const y = W.oberster(this.get, x, z);
      if (y <= 0 || y >= W.CH - 3) return false;
      const boden = this.get(x, y, z);
      if (W.FEST[this.get(x, y + 1, z)] || W.FEST[this.get(x, y + 2, z)] || this.get(x, y + 1, z) === W.WASSER) return false;
      if (feind) {
        if (!W.OPAK[boden] || boden === W.LAUB || boden === W.BIRKENLAUB) return false;
        this.neu('zombie', x + 0.5, y + 1, z + 0.5);
        return true;
      } else {
        if (boden !== W.GRAS) return false;
        const art = r() < 0.4 ? 'schaf' : r() < 0.6 ? 'schwein' : 'huhn';
        const n = 1 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) this.neu(art, x + 0.5 + (r() - 0.5) * 1.5, y + 1.05, z + 0.5 + (r() - 0.5) * 1.5);
        return true;
      }
    }
    // Ein Spieler haut zu. Liefert null (verfehlt), sonst {tot, beute}
    hau(id, s, vonX, vonZ) {
      const t = this.m.get(id);
      if (!t) return null;
      const a = ARTEN[t.art];
      t.hp -= s; t.verletzt = 0.35;
      const dx = t.x - vonX, dz = t.z - vonZ, d = Math.hypot(dx, dz) || 1;
      t.vx = dx / d * 7; t.vz = dz / d * 7; t.vy = 5.5; t.boden = false;
      if (!a.feind) { t.panik = 4; t.px = vonX; t.pz = vonZ; }
      if (t.hp <= 0) { this.m.delete(id); return { tot: true, beute: a.beute(this.r) }; }
      return { tot: false, beute: [] };
    }
    liste() {
      const l = [];
      for (const t of this.m.values()) l.push([t.id, ARTEN[t.art].nr, +t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2), +t.ry.toFixed(2), t.verletzt > 0 ? 1 : 0]);
      return l;
    }
  }
  Tiere.ARTEN = ARTEN;
  Tiere.ART_LISTE = ART_LISTE;
  return Tiere;
});
