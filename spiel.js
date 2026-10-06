'use strict';
// Quaderland - Client: Chunks, Meshing, Physik, Steuerung, Online
(function () {
  const W = Welt, CX = W.CX, CH = W.CH;
  const $ = id => document.getElementById(id);
  const touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  const DAUER = 480;            // Sekunden pro Tag
  const BR = 0.3, HOCH = 1.8, AUGE = 1.62, REICH = 6;

  /* ---------- Speicher im Browser (darf fehlen) ---------- */
  const ls = {
    get(k, vor) { try { const v = localStorage.getItem('quaderland.' + k); return v == null ? vor : v; } catch (e) { return vor; } },
    set(k, v) { try { localStorage.setItem('quaderland.' + k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('quaderland.' + k); } catch (e) { /* egal */ } }
  };

  /* ---------- three.js ---------- */
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
  const szene = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(72, 1, 0.08, 600);
  kamera.rotation.order = 'YXZ';
  szene.add(kamera);
  function groesse() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    kamera.aspect = window.innerWidth / window.innerHeight;
    kamera.updateProjectionMatrix();
  }
  window.addEventListener('resize', groesse); groesse();

  const atlasCanvas = Texturen.atlas();
  const atlasTex = new THREE.CanvasTexture(atlasCanvas);
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.generateMipmaps = false;
  const matOpak = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 });
  // Lampen leuchten auch nachts (ohne Tageslicht-Toenung)
  const matLicht = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true });
  const matWasser = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });

  // Himmel: Sonne, Mond, Sterne
  const sonne = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false, depthWrite: false }));
  const mond = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false, depthWrite: false }));
  sonne.renderOrder = mond.renderOrder = -1;
  szene.add(sonne); szene.add(mond);
  const sternPos = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), r = 480;
    sternPos[i * 3] = r * Math.sin(b) * Math.cos(a); sternPos[i * 3 + 1] = r * Math.cos(b); sternPos[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
  }
  const sterneGeo = new THREE.BufferGeometry();
  sterneGeo.setAttribute('position', new THREE.BufferAttribute(sternPos, 3));
  const sterne = new THREE.Points(sterneGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  sterne.frustumCulled = false; sterne.renderOrder = -2;
  szene.add(sterne);
  szene.fog = new THREE.Fog(0x87ceeb, 40, 100);

  // Markierung des angezielten Blocks
  const markierung = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 }));
  markierung.visible = false;
  szene.add(markierung);

  /* ---------- Bloecke und Symbole ---------- */
  const KACHEL = W.TAB.map(t => t[1] ? [Texturen.index(t[1]), Texturen.index(t[2]), Texturen.index(t[3])] : null);
  const ART = W.TAB.map(t => t[4]);
  const OPAK = W.OPAK, FEST = W.FEST;
  const symbole = [];
  function symbolVon(b) {
    if (!symbole[b]) symbole[b] = Texturen.symbol(atlasCanvas, W.TAB[b][1], W.TAB[b][3], 64);
    return symbole[b];
  }
  function symbolKopie(b) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    c.getContext('2d').drawImage(symbolVon(b), 0, 0);
    return c;
  }

  /* ---------- Welt / Chunks ---------- */
  let seed = 1;
  const chunks = new Map();     // Schluessel -> Chunk
  const edits = new Map();      // Chunk-Schluessel -> Map(Index -> Block)
  let editsGeaendert = false;
  let warteschlange = [];
  let letzterChunkX = 1e9, letzterChunkZ = 1e9;
  let sicht = Number(ls.get('sicht', touch ? 4 : 8)) || 6;
  const ck = (cx, cz) => (cx + 0x8000) * 0x10000 + (cz + 0x8000);

  function chunkMitDaten(cx, cz) {
    const k = ck(cx, cz);
    let c = chunks.get(k);
    if (!c) { c = { cx, cz, k, data: null, mesh: null, wasser: null, bau: false }; chunks.set(k, c); }
    if (!c.data) {
      c.data = W.chunkErzeugen(seed, cx, cz);
      const e = edits.get(k);
      if (e) for (const [i, b] of e) c.data[i] = b;
    }
    return c;
  }
  function getBlock(x, y, z) {
    if (y < 0) return W.GRUND;
    if (y >= CH) return 0;
    const c = chunkMitDaten(x >> 4, z >> 4);
    return c.data[(x & 15) + (z & 15) * CX + y * CX * CX];
  }
  function setBlock(x, y, z, b) {
    if (y < 1 || y >= CH) return;
    const cx = x >> 4, cz = z >> 4, c = chunkMitDaten(cx, cz);
    const lx = x & 15, lz = z & 15, i = lx + lz * CX + y * CX * CX;
    if (c.data[i] === b) return;
    c.data[i] = b;
    let e = edits.get(c.k);
    if (!e) { e = new Map(); edits.set(c.k, e); }
    e.set(i, b);
    editsGeaendert = true;
    neuBauen(c);
    if (lx === 0) neuBauen(chunkMitDaten(cx - 1, cz));
    if (lx === 15) neuBauen(chunkMitDaten(cx + 1, cz));
    if (lz === 0) neuBauen(chunkMitDaten(cx, cz - 1));
    if (lz === 15) neuBauen(chunkMitDaten(cx, cz + 1));
  }
  function aenderungFlach() {
    const a = [];
    for (const [k, e] of edits) {
      const cx = Math.floor(k / 0x10000) - 0x8000, cz = (k % 0x10000) - 0x8000;
      for (const [i, b] of e) a.push(cx * CX + (i % CX), Math.floor(i / (CX * CX)), cz * CX + (Math.floor(i / CX) % CX), b);
    }
    return a;
  }
  function chunkLoeschen(c) {
    for (const m of [c.mesh, c.wasser, c.licht]) if (m) { szene.remove(m); m.geometry.dispose(); }
    c.mesh = c.wasser = c.licht = null;
    chunks.delete(c.k);
  }
  function weltLaden(neuerSeed, flach) {
    for (const c of [...chunks.values()]) chunkLoeschen(c);
    edits.clear(); warteschlange = []; letzterChunkX = 1e9;
    seed = neuerSeed;
    for (let i = 0; i + 3 < flach.length; i += 4) {
      const x = flach[i], y = flach[i + 1], z = flach[i + 2];
      const k = ck(x >> 4, z >> 4);
      let e = edits.get(k); if (!e) { e = new Map(); edits.set(k, e); }
      e.set((x & 15) + (z & 15) * CX + y * CX * CX, flach[i + 3]);
    }
    editsGeaendert = false;
  }
  function neuBauen(c) {
    // Chunks im Sichtbereich sofort neu bauen, damit Bauen und Abbauen ohne Verzoegerung wirkt
    if (c.bau) { baueMesh(c); }
    else if (!warteschlange.includes(c)) warteschlange.push(c);
  }

  /* ---------- Meshing ---------- */
  const E3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const ECKEN = [[0, 0], [1, 0], [1, 1], [0, 1]], ECKEN_R = [[0, 1], [1, 1], [1, 0], [0, 0]];
  const AOF = [0.5, 0.68, 0.84, 1];
  const PAD = new Uint8Array(18 * 18 * CH);
  const ATLAS_B = Texturen.SPALTEN * Texturen.PX, ATLAS_H = Texturen.ZEILEN * Texturen.PX;

  function baueMesh(c) {
    c.bau = true;
    chunkMitDaten(c.cx, c.cz);
    const nb = {};
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nb[dx + ',' + dz] = chunkMitDaten(c.cx + dx, c.cz + dz).data;
    for (let dz = -1; dz <= CX; dz++) {
      const qz = dz < 0 ? -1 : dz >= CX ? 1 : 0, lz = dz & 15;
      for (let dx = -1; dx <= CX; dx++) {
        const qx = dx < 0 ? -1 : dx >= CX ? 1 : 0, lx = dx & 15;
        const d = nb[qx + ',' + qz];
        const o = (dx + 1) + (dz + 1) * 18;
        for (let y = 0; y < CH; y++) PAD[o + y * 324] = d[lx + lz * CX + y * CX * CX];
      }
    }
    const B = (x, y, z) => y < 0 ? W.GRUND : y >= CH ? 0 : PAD[(x + 1) + (z + 1) * 18 + y * 324];
    const op = { p: [], c: [], u: [], i: [], n: 0 }, wa = { p: [], c: [], u: [], i: [], n: 0 }, le = { p: [], c: [], u: [], i: [], n: 0 };

    function flaeche(buf, x, y, z, n, s, kachel, schatten, wasserKante) {
      const u = (n + 1) % 3, v = (n + 2) % 3, en = E3[n], eu = E3[u], ev = E3[v];
      const bx = x + s * en[0], by = y + s * en[1], bz = z + s * en[2];
      const ecken = s > 0 ? ECKEN : ECKEN_R;
      const ao = [3, 3, 3, 3];
      if (!wasserKante) {
        for (let k = 0; k < 4; k++) {
          const cu = ecken[k][0], cv = ecken[k][1], du = cu ? 1 : -1, dv = cv ? 1 : -1;
          const s1 = OPAK[B(bx + du * eu[0], by + du * eu[1], bz + du * eu[2])];
          const s2 = OPAK[B(bx + dv * ev[0], by + dv * ev[1], bz + dv * ev[2])];
          const cc = OPAK[B(bx + du * eu[0] + dv * ev[0], by + du * eu[1] + dv * ev[1], bz + du * eu[2] + dv * ev[2])];
          ao[k] = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
        }
      }
      const col = kachel % Texturen.SPALTEN, row = Math.floor(kachel / Texturen.SPALTEN), ein = 0.15, br = Texturen.PX - 2 * ein;
      const basis = buf.n;
      for (let k = 0; k < 4; k++) {
        const cu = ecken[k][0], cv = ecken[k][1];
        const vx = x + en[0] * (s > 0 ? 1 : 0) + eu[0] * cu + ev[0] * cv;
        let vy = y + en[1] * (s > 0 ? 1 : 0) + eu[1] * cu + ev[1] * cv;
        const vz = z + en[2] * (s > 0 ? 1 : 0) + eu[2] * cu + ev[2] * cv;
        if (wasserKante && vy > y + 0.5) vy -= 0.12;
        buf.p.push(vx, vy, vz);
        let su, tu;
        if (n === 0) { su = cv; tu = cu; } else { su = cu; tu = cv; }
        buf.u.push((col * Texturen.PX + ein + su * br) / ATLAS_B, 1 - (row * Texturen.PX + ein + (1 - tu) * br) / ATLAS_H);
        const h = Math.round(255 * schatten * AOF[ao[k]]);
        buf.c.push(h, h, h);
      }
      if (ao[0] + ao[2] > ao[1] + ao[3]) buf.i.push(basis, basis + 1, basis + 2, basis, basis + 2, basis + 3);
      else buf.i.push(basis + 1, basis + 2, basis + 3, basis + 1, basis + 3, basis);
      buf.n += 4;
    }

    for (let y = 0; y < CH; y++) {
      for (let z = 0; z < CX; z++) {
        for (let x = 0; x < CX; x++) {
          const b = PAD[(x + 1) + (z + 1) * 18 + y * 324];
          if (!b) continue;
          const art = ART[b], kt = KACHEL[b];
          for (let n = 0; n < 3; n++) {
            for (let s = 1; s >= -1; s -= 2) {
              const nx = x + (n === 0 ? s : 0), ny = y + (n === 1 ? s : 0), nz = z + (n === 2 ? s : 0);
              const nbb = B(nx, ny, nz);
              let sichtbar;
              if (art === 'o') sichtbar = !OPAK[nbb];
              else if (art === 'd') sichtbar = !OPAK[nbb] && nbb !== b;
              else sichtbar = nbb === 0 || (!OPAK[nbb] && nbb !== W.WASSER);
              if (!sichtbar) continue;
              const kachel = n === 1 ? (s > 0 ? kt[0] : kt[1]) : kt[2];
              const schatten = n === 1 ? (s > 0 ? 1 : 0.5) : (n === 0 ? 0.82 : 0.68);
              if (art === 'w') flaeche(wa, x, y, z, n, s, kachel, schatten, B(x, y + 1, z) !== W.WASSER);
              else flaeche(b === W.LAMPE ? le : op, x, y, z, n, s, kachel, b === W.LAMPE ? 1 : schatten, false);
            }
          }
        }
      }
    }

    function geo(buf) {
      if (!buf.n) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf.p), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(buf.c), 3, true));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf.u), 2));
      g.setIndex(new THREE.BufferAttribute(buf.n > 65000 ? new Uint32Array(buf.i) : new Uint16Array(buf.i), 1));
      g.computeBoundingSphere();
      return g;
    }
    for (const [feld, buf, mat, ord] of [['mesh', op, matOpak, 0], ['wasser', wa, matWasser, 1], ['licht', le, matLicht, 0]]) {
      if (c[feld]) { szene.remove(c[feld]); c[feld].geometry.dispose(); c[feld] = null; }
      const g = geo(buf);
      if (g) {
        const m = new THREE.Mesh(g, mat);
        m.position.set(c.cx * CX, 0, c.cz * CX);
        m.renderOrder = ord;
        szene.add(m);
        c[feld] = m;
      }
    }
    c.bau = true;
  }

  function chunksAktualisieren(erzwingen) {
    const pcx = Math.floor(spieler.x / CX), pcz = Math.floor(spieler.z / CX);
    if (!erzwingen && pcx === letzterChunkX && pcz === letzterChunkZ) return;
    letzterChunkX = pcx; letzterChunkZ = pcz;
    const R = sicht;
    const liste = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R + 1) continue;
        const k = ck(pcx + dx, pcz + dz);
        let c = chunks.get(k);
        if (!c) { c = { cx: pcx + dx, cz: pcz + dz, k, data: null, mesh: null, wasser: null, bau: false }; chunks.set(k, c); }
        if (!c.bau) liste.push([d2, c]);
      }
    }
    liste.sort((a, b) => a[0] - b[0]);
    warteschlange = liste.map(l => l[1]);
    for (const c of [...chunks.values()]) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (R + 2) * (R + 2)) chunkLoeschen(c);
    }
  }
  function meshArbeit(budgetMs) {
    const start = performance.now();
    let n = 0;
    while (warteschlange.length && (n === 0 || performance.now() - start < budgetMs)) {
      const c = warteschlange.shift();
      if (!chunks.has(c.k) || c.bau) continue;
      baueMesh(c); n++;
    }
    return n;
  }

  /* ---------- Spieler ---------- */
  const spieler = { x: 0, y: 40, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, boden: false, fliegen: false, imWasser: false };
  const eing = { vor: false, rueck: false, links: false, rechts: false, spring: false, runter: false, laufen: false };
  const achse = { x: 0, z: 0 };
  const hotbar = (ls.get('hotbar', '') || '').split(',').map(Number).filter(n => W.PLATZIERBAR.includes(n));
  const STANDARD_HOTBAR = [W.GRAS, W.ERDE, W.STEIN, W.BRUCH, W.BRETTER, W.STAMM, W.GLAS, W.ZIEGEL, W.LAMPE];
  while (hotbar.length < 9) hotbar.push(STANDARD_HOTBAR[hotbar.length]);
  hotbar.length = 9;
  let gewaehlt = 0;
  let spielLaeuft = false, modus = 'solo';
  let tageszeit = 0.06, zeitOffset = 0;

  function kollision(x, y, z) {
    const x0 = Math.floor(x - BR), x1 = Math.floor(x + BR), y0 = Math.floor(y), y1 = Math.floor(y + HOCH - 0.001);
    const z0 = Math.floor(z - BR), z1 = Math.floor(z + BR);
    for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) if (FEST[getBlock(bx, by, bz)]) return true;
    return false;
  }
  function oberster(x, z) {
    for (let y = CH - 1; y > 0; y--) if (getBlock(x, y, z) !== 0) return y;
    return 0;
  }
  function startPosition() {
    const p = W.startpunkt(seed);
    let y = oberster(p.x, p.z);
    return { x: p.x + 0.5, y: y + 1.01, z: p.z + 0.5 };
  }
  function freiStellen() {
    for (let i = 0; i < CH && kollision(spieler.x, spieler.y, spieler.z); i++) spieler.y += 1;
  }
  function physikSchritt(dt) {
    const s = spieler;
    const kopfY = Math.floor(s.y + 1.4), fussY = Math.floor(s.y + 0.3);
    s.imWasser = getBlock(Math.floor(s.x), fussY, Math.floor(s.z)) === W.WASSER || getBlock(Math.floor(s.x), kopfY, Math.floor(s.z)) === W.WASSER;
    let ax = (eing.rechts ? 1 : 0) - (eing.links ? 1 : 0) + achse.x, az = (eing.rueck ? 1 : 0) - (eing.vor ? 1 : 0) + achse.z;
    const l = Math.hypot(ax, az);
    if (l > 1) { ax /= l; az /= l; }
    let tempo = s.fliegen ? (eing.laufen ? 22 : 11) : (eing.laufen ? 5.9 : 4.3);
    if (s.imWasser && !s.fliegen) tempo *= 0.6;
    const sn = Math.sin(s.yaw), cs = Math.cos(s.yaw);
    const wx = (ax * cs + az * sn) * tempo, wz = (-ax * sn + az * cs) * tempo;
    const k = Math.min(1, (s.fliegen ? 8 : s.boden ? 14 : 4) * dt);
    s.vx += (wx - s.vx) * k; s.vz += (wz - s.vz) * k;

    if (s.fliegen) {
      const ziel = ((eing.spring ? 1 : 0) - (eing.runter ? 1 : 0)) * (eing.laufen ? 14 : 8);
      s.vy += (ziel - s.vy) * Math.min(1, 10 * dt);
    } else if (s.imWasser) {
      s.vy -= 12 * dt;
      if (eing.spring) s.vy += 34 * dt;
      s.vy = Math.max(-3.5, Math.min(3.8, s.vy));
    } else {
      s.vy = Math.max(-50, s.vy - 28 * dt);
      if (eing.spring && s.boden) { s.vy = 8.6; s.boden = false; }
    }
    const bewegt = Math.abs(ax) + Math.abs(az) > 0.1;
    let nx = s.x + s.vx * dt;
    if (!kollision(nx, s.y, s.z)) s.x = nx;
    else { if (s.boden && bewegt && !kollision(nx, s.y + 1.0, s.z) && !s.fliegen) { s.vy = 8.2; s.boden = false; } s.vx = 0; }
    let nz = s.z + s.vz * dt;
    if (!kollision(s.x, s.y, nz)) s.z = nz;
    else { if (s.boden && bewegt && !kollision(s.x, s.y + 1.0, nz) && !s.fliegen) { s.vy = 8.2; s.boden = false; } s.vz = 0; }
    let ny = s.y + s.vy * dt;
    s.boden = false;
    if (!kollision(s.x, ny, s.z)) s.y = ny;
    else {
      if (s.vy < 0) { s.y = Math.floor(ny) + 1 + 1e-4; s.boden = true; if (s.fliegen) s.fliegen = false; }
      else s.y = Math.floor(ny + HOCH) - HOCH - 1e-4;
      s.vy = 0;
    }
    if (s.y < -30) { const p = startPosition(); s.x = p.x; s.y = p.y; s.z = p.z; s.vx = s.vy = s.vz = 0; meldung('Ins Nichts gefallen – zurück am Start.'); }
  }
  function physik(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let i = 0; i < n; i++) physikSchritt(dt / n);
  }

  /* ---------- Zielen, Abbauen, Setzen ---------- */
  function strahl(ox, oy, oz, dx, dy, dz, max) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = dx > 0 ? (x + 1 - ox) / dx : dx < 0 ? (ox - x) / -dx : Infinity;
    let ty = dy > 0 ? (y + 1 - oy) / dy : dy < 0 ? (oy - y) / -dy : Infinity;
    let tz = dz > 0 ? (z + 1 - oz) / dz : dz < 0 ? (oz - z) / -dz : Infinity;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < 40; i++) {
      const b = getBlock(x, y, z);
      if (b !== 0 && b !== W.WASSER) return { x, y, z, nx, ny, nz, b };
      if (tx < ty && tx < tz) { if (tx > max) break; x += sx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { if (ty > max) break; y += sy; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { if (tz > max) break; z += sz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
  let ziel = null;
  function blickRichtung() {
    const cp = Math.cos(spieler.pitch);
    return [-Math.sin(spieler.yaw) * cp, Math.sin(spieler.pitch), -Math.cos(spieler.yaw) * cp];
  }
  function zielen() {
    const d = blickRichtung();
    ziel = strahl(spieler.x, spieler.y + AUGE, spieler.z, d[0], d[1], d[2], REICH);
    if (ziel) { markierung.visible = true; markierung.position.set(ziel.x + 0.5, ziel.y + 0.5, ziel.z + 0.5); }
    else markierung.visible = false;
  }
  function blockAendern(x, y, z, b) {
    setBlock(x, y, z, b);
    if (modus === 'online' && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'block', x, y, z, b }));
  }
  function abbauen() {
    zielen();
    if (!ziel || ziel.b === W.GRUND || ziel.y < 1) return;
    blockAendern(ziel.x, ziel.y, ziel.z, 0);
  }
  function setzen() {
    zielen();
    if (!ziel) return;
    const x = ziel.x + ziel.nx, y = ziel.y + ziel.ny, z = ziel.z + ziel.nz;
    if (y < 1 || y >= CH) return;
    const alt = getBlock(x, y, z);
    if (alt !== 0 && alt !== W.WASSER) return;
    // nicht in sich selbst bauen
    const s = spieler;
    if (x + 1 > s.x - BR && x < s.x + BR && y + 1 > s.y && y < s.y + HOCH && z + 1 > s.z - BR && z < s.z + BR) return;
    blockAendern(x, y, z, hotbar[gewaehlt]);
  }
  function waehlen() {
    zielen();
    if (!ziel || !W.PLATZIERBAR.includes(ziel.b)) return;
    const i = hotbar.indexOf(ziel.b);
    if (i >= 0) gewaehlt = i; else hotbar[gewaehlt] = ziel.b;
    hotbarZeichnen();
  }

  /* ---------- Hotbar und Inventar ---------- */
  const hotbarEl = $('hotbar');
  let nameTimer = 0;
  function hotbarZeichnen() {
    hotbarEl.innerHTML = '';
    hotbar.forEach((b, i) => {
      const d = document.createElement('div');
      d.className = 'slot' + (i === gewaehlt ? ' an' : '');
      d.appendChild(symbolKopie(b));
      const z = document.createElement('i'); z.textContent = i + 1; d.appendChild(z);
      d.addEventListener('pointerdown', e => { e.stopPropagation(); gewaehlt = i; hotbarZeichnen(); zeigeName(); });
      hotbarEl.appendChild(d);
    });
    ls.set('hotbar', hotbar.join(','));
  }
  function zeigeName() {
    const el = $('name');
    el.textContent = W.TAB[hotbar[gewaehlt]][0];
    el.style.opacity = 1;
    clearTimeout(nameTimer); nameTimer = setTimeout(() => { el.style.opacity = 0; }, 1400);
  }
  function inventarBauen() {
    const r = $('raster'); r.innerHTML = '';
    W.PLATZIERBAR.forEach(b => {
      const d = document.createElement('div'); d.className = 'slot'; d.title = W.TAB[b][0];
      d.appendChild(symbolKopie(b));
      d.addEventListener('click', () => { hotbar[gewaehlt] = b; hotbarZeichnen(); zeigeName(); });
      r.appendChild(d);
    });
  }

  /* ---------- Meldungen, Chat ---------- */
  let toastTimer = 0;
  function meldung(text) {
    const el = $('toast'); el.textContent = text; el.style.opacity = 1;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.style.opacity = 0; }, 2600);
  }
  function chatZeile(name, text, system) {
    const d = document.createElement('div');
    if (system) { d.className = 'sys'; d.textContent = text; }
    else { const b = document.createElement('b'); b.textContent = name + ': '; d.appendChild(b); d.appendChild(document.createTextNode(text)); }
    const log = $('chatlog'); log.appendChild(d);
    while (log.children.length > 8) log.removeChild(log.firstChild);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 1000); }, 9000);
  }
  let chatOffen = false;
  function chatOeffnen() {
    if (modus !== 'online' || chatOffen || !spielLaeuft) return;
    chatOffen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const e = $('chateingabe'); e.style.display = 'block'; e.value = ''; setTimeout(() => e.focus(), 30);
  }
  function chatSchliessen(senden) {
    const e = $('chateingabe');
    if (senden && e.value.trim() && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'chat', text: e.value }));
    e.style.display = 'none'; e.blur(); chatOffen = false;
    if (!touch && spielLaeuft) sperren();
  }
  $('chateingabe').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') chatSchliessen(true);
    else if (e.key === 'Escape') chatSchliessen(false);
  });

  /* ---------- Andere Spieler ---------- */
  const andere = new Map();
  let meineId = 0;
  const HAUT = 0xe8b890;
  function namensschild(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const g = c.getContext('2d');
    g.font = '700 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.min(246, g.measureText(text).width + 20);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(128 - w / 2, 4, w, 40);
    g.fillStyle = '#fff'; g.fillText(text, 128, 25, 236);
    const t = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(1.6, 0.3, 1);
    return sp;
  }
  function avatar(id, name) {
    const farbe = new THREE.Color().setHSL(((id * 0.137) % 1), 0.65, 0.5);
    const hose = new THREE.Color().setHSL(((id * 0.137 + 0.5) % 1), 0.35, 0.28);
    const g = new THREE.Group();
    const teil = (b, h, t, col, x, y, z, pivotY) => {
      const geo = new THREE.BoxGeometry(b, h, t); geo.translate(0, -pivotY, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, fog: true }));
      m.position.set(x, y, z); g.add(m); return m;
    };
    const kopf = teil(0.5, 0.5, 0.5, HAUT, 0, 1.55, 0, -0.0);
    teil(0.5, 0.7, 0.28, farbe, 0, 1.3, 0, 0.35);
    const armL = teil(0.22, 0.7, 0.22, farbe, -0.36, 1.3, 0, 0.3);
    const armR = teil(0.22, 0.7, 0.22, farbe, 0.36, 1.3, 0, 0.3);
    const beinL = teil(0.24, 0.7, 0.26, hose, -0.13, 0.7, 0, 0.35);
    const beinR = teil(0.24, 0.7, 0.26, hose, 0.13, 0.7, 0, 0.35);
    // Augen
    const augen = new THREE.Group();
    for (const ax of [-0.12, 0.12]) { const au = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x222233 })); au.position.set(ax, 0, 0); augen.add(au); }
    augen.position.set(0, 1.6, -0.26); g.add(augen);
    const schild = namensschild(name); schild.position.y = 2.15; g.add(schild);
    szene.add(g);
    return { id, name, g, kopf, augen, armL, armR, beinL, beinR, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, ry: 0, tr: 0, rp: 0, phase: 0, neu: true };
  }
  function andereHinzu(id, name, p) {
    if (andere.has(id) || id === meineId) return;
    const a = avatar(id, name);
    if (p) { a.tx = a.x = p.x; a.ty = a.y = p.y; a.tz = a.z = p.z; a.tr = a.ry = p.ry || 0; a.rp = p.rp || 0; }
    andere.set(id, a); listeZeichnen();
  }
  function andereEntfernen(id) {
    const a = andere.get(id); if (!a) return;
    szene.remove(a.g); a.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    andere.delete(id); listeZeichnen();
  }
  function andereAktualisieren(dt) {
    for (const a of andere.values()) {
      const k = 1 - Math.exp(-14 * dt);
      const vorX = a.x, vorZ = a.z;
      a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k; a.z += (a.tz - a.z) * k;
      let dr = a.tr - a.ry; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
      a.ry += dr * k;
      const v = Math.hypot(a.x - vorX, a.z - vorZ) / Math.max(dt, 0.001);
      a.phase += v * dt * 2.2;
      const sw = Math.sin(a.phase) * Math.min(1, v / 3) * 0.9;
      a.armL.rotation.x = sw; a.armR.rotation.x = -sw; a.beinL.rotation.x = -sw; a.beinR.rotation.x = sw;
      a.g.position.set(a.x, a.y, a.z);
      a.g.rotation.y = a.ry;
      a.kopf.rotation.x = a.rp; a.augen.position.y = 1.55 + 0.03;
    }
  }
  function listeZeichnen() {
    const el = $('listeInhalt'); el.innerHTML = '';
    const namen = [ls.get('name', 'Du') + ' (du)', ...[...andere.values()].map(a => a.name)];
    for (const n of namen) { const d = document.createElement('div'); d.textContent = n; el.appendChild(d); }
  }

  /* ---------- Netzwerk ---------- */
  let ws = null, sendeTimer = 0, sicherungsZeit = 0;
  function verbinden(name) {
    return new Promise((ok, fehler) => {
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
      let fertig = false;
      try { ws = new WebSocket(url); } catch (e) { return fehler(new Error('Verbindung nicht möglich.')); }
      const sock = ws;
      const timeout = setTimeout(() => { if (!fertig) { fertig = true; try { sock.close(); } catch (e) { /* egal */ } fehler(new Error('Der Server antwortet nicht. Versuche es gleich noch einmal.')); } }, 20000);
      sock.onopen = () => sock.send(JSON.stringify({ t: 'hallo', name }));
      sock.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'start') {
          if (!fertig) { fertig = true; clearTimeout(timeout); ok(m); }
          return;
        }
        if (m.t === 'fehler' && !fertig) { fertig = true; clearTimeout(timeout); fehler(new Error(m.text)); return; }
        netzNachricht(m);
      };
      sock.onerror = () => { if (!fertig) { fertig = true; clearTimeout(timeout); fehler(new Error('Keine Verbindung zum Server.')); } };
      sock.onclose = () => {
        if (!fertig) { fertig = true; clearTimeout(timeout); fehler(new Error('Verbindung geschlossen.')); return; }
        if (spielLaeuft && modus === 'online' && ws === sock) { zumMenue('Die Verbindung zum Server wurde getrennt.'); }
      };
    });
  }
  function netzNachricht(m) {
    switch (m.t) {
      case 'rein': andereHinzu(m.id, m.name); chatZeile('', m.name + ' ist beigetreten.', true); break;
      case 'raus': { const a = andere.get(m.id); if (a) chatZeile('', a.name + ' hat die Welt verlassen.', true); andereEntfernen(m.id); break; }
      case 'p': for (const p of m.l) { const a = andere.get(p[0]); if (!a) continue; a.tx = p[1]; a.ty = p[2]; a.tz = p[3]; a.tr = p[4]; a.rp = p[5]; if (a.neu) { a.x = a.tx; a.y = a.ty; a.z = a.tz; a.ry = a.tr; a.neu = false; } } break;
      case 'block':
        if (m.b === -1) {
          // Server hat meine Aenderung abgelehnt: urspruenglichen Zustand wiederherstellen
          const k = ck(m.x >> 4, m.z >> 4), e = edits.get(k);
          if (e) e.delete((m.x & 15) + (m.z & 15) * CX + m.y * CX * CX);
          const c = chunks.get(k); if (c) { c.data = null; neuBauen(chunkMitDaten(c.cx, c.cz)); }
        } else {
          setBlock(m.x, m.y, m.z, m.b);
          if (spielerBlockUeberlappt(m.x, m.y, m.z)) freiStellen();
        }
        break;
      case 'chat': chatZeile(m.name, m.text, false); break;
      case 'welt': weltLaden(m.seed, m.a); chunksAktualisieren(true); freiStellen(); meldung('Welt aus einer Sicherung wiederhergestellt.'); break;
    }
  }
  function spielerBlockUeberlappt(x, y, z) {
    const s = spieler;
    return x + 1 > s.x - BR && x < s.x + BR && y + 1 > s.y && y < s.y + HOCH && z + 1 > s.z - BR && z < s.z + BR;
  }
  function sichereOnline() {
    if (modus !== 'online' || !editsGeaendert) return;
    const a = aenderungFlach();
    if (!a.length) return;
    if (ls.set('sicherung', JSON.stringify({ seed, a }))) editsGeaendert = false;
  }

  /* ---------- Speichern (Einzelwelt) ---------- */
  function sicherSolo() {
    if (!spielLaeuft || modus !== 'solo') return;
    ls.set('solo', JSON.stringify({ seed, a: aenderungFlach(), x: spieler.x, y: spieler.y, z: spieler.z, yaw: spieler.yaw, pitch: spieler.pitch, zeit: tageszeit }));
    editsGeaendert = false;
  }
  function soloLesen() {
    try { const j = JSON.parse(ls.get('solo', 'null')); return j && Number.isInteger(j.seed) && Array.isArray(j.a) ? j : null; } catch (e) { return null; }
  }

  /* ---------- Tageszeit ---------- */
  const HIMMEL_TAG = new THREE.Color(0x87ceeb), HIMMEL_NACHT = new THREE.Color(0x070b18), HIMMEL_ROT = new THREE.Color(0xff9a5a);
  const TON_TAG = new THREE.Color(1, 1, 1), TON_NACHT = new THREE.Color(0.2, 0.23, 0.4);
  const himmel = new THREE.Color();
  const glatte = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function himmelAktualisieren() {
    const winkel = tageszeit * Math.PI * 2, hoehe = Math.sin(winkel);
    const licht = glatte(-0.12, 0.28, hoehe);
    himmel.copy(HIMMEL_NACHT).lerp(HIMMEL_TAG, licht);
    const daemmerung = Math.max(0, 1 - Math.abs(hoehe) / 0.22) * 0.55;
    himmel.lerp(HIMMEL_ROT, daemmerung);
    szene.background = himmel; szene.fog.color.copy(himmel);
    matOpak.color.copy(TON_NACHT).lerp(TON_TAG, licht);
    matWasser.color.copy(matOpak.color);
    const d = 400;
    const px = kamera.position.x, py = kamera.position.y, pz = kamera.position.z;
    sonne.position.set(px + Math.cos(winkel) * d, py + Math.sin(winkel) * d, pz + 40);
    mond.position.set(px - Math.cos(winkel) * d, py - Math.sin(winkel) * d, pz + 40);
    sonne.lookAt(kamera.position); mond.lookAt(kamera.position);
    sterne.position.copy(kamera.position);
    sterne.material.opacity = Math.max(0, 1 - licht * 1.6);
    sterne.rotation.z = winkel * 0.3;
  }

  /* ---------- Eingabe: Tastatur und Maus ---------- */
  function sperren() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* egal */ } }
  let ueberlagerung = false;
  const taste = (e, an) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': eing.vor = an; break;
      case 'KeyS': case 'ArrowDown': eing.rueck = an; break;
      case 'KeyA': case 'ArrowLeft': eing.links = an; break;
      case 'KeyD': case 'ArrowRight': eing.rechts = an; break;
      case 'ShiftLeft': case 'ShiftRight': eing.laufen = an; eing.runter = an; break;
      case 'ControlLeft': eing.laufen = an; break;
      case 'Space': {
        if (an && !eing.spring) {
          const j = performance.now();
          if (j - letzterSprung < 300) { spieler.fliegen = !spieler.fliegen; spieler.vy = 0; meldung(spieler.fliegen ? 'Flugmodus an' : 'Flugmodus aus'); }
          letzterSprung = j;
        }
        eing.spring = an; break;
      }
    }
  };
  let letzterSprung = 0;
  window.addEventListener('keydown', e => {
    if (!spielLaeuft || chatOffen || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyE') { inventarUmschalten(); return; }
    if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); chatOeffnen(); return; }
    if (e.code === 'Tab') { $('liste').style.display = 'block'; return; }
    if (e.code === 'F3') { e.preventDefault(); const i = $('info'); i.style.display = i.style.display === 'block' ? 'none' : 'block'; return; }
    if (e.code.startsWith('Digit') && e.code !== 'Digit0') { gewaehlt = Number(e.code.slice(5)) - 1; hotbarZeichnen(); zeigeName(); return; }
    taste(e, true);
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Tab') $('liste').style.display = 'none';
    taste(e, false);
  });
  window.addEventListener('blur', () => { for (const k in eing) eing[k] = false; });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas || !spielLaeuft) return;
    spieler.yaw -= e.movementX * 0.0022;
    spieler.pitch = Math.max(-1.55, Math.min(1.55, spieler.pitch - e.movementY * 0.0022));
  });
  let mausLinks = false, mausZeit = 0;
  canvas.addEventListener('mousedown', e => {
    if (touch && !matchMedia('(pointer: fine)').matches) return;
    if (!spielLaeuft || ueberlagerung || chatOffen) return;
    if (document.pointerLockElement !== canvas) { sperren(); return; }
    if (e.button === 0) { mausLinks = true; abbauen(); mausZeit = 0.28; }
    else if (e.button === 2) setzen();
    else if (e.button === 1) { e.preventDefault(); waehlen(); }
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) mausLinks = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('wheel', e => {
    if (!spielLaeuft || ueberlagerung || chatOffen) return;
    gewaehlt = (gewaehlt + (e.deltaY > 0 ? 1 : -1) + 9) % 9; hotbarZeichnen(); zeigeName();
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    if (spielLaeuft && document.pointerLockElement !== canvas && !ueberlagerung && !chatOffen && !touch) pauseZeigen();
  });

  function inventarUmschalten() {
    const inv = $('inventar');
    if (inv.classList.contains('offen')) {
      inv.classList.remove('offen'); ueberlagerung = false; if (!touch) sperren();
    } else {
      ueberlagerung = true; if (document.pointerLockElement) document.exitPointerLock();
      inv.classList.add('offen');
    }
  }
  $('bInvZu').addEventListener('click', inventarUmschalten);

  /* ---------- Eingabe: Touch ---------- */
  const tl = $('touch');
  let stickId = null, stickX = 0, stickY = 0, blickId = null, blickX = 0, blickY = 0, blickBewegt = 0, blickStart = 0, haltTimer = 0, haltAusgeloest = false;
  tl.addEventListener('pointerdown', e => {
    if (e.target !== tl || ueberlagerung || !spielLaeuft) return;
    try { tl.setPointerCapture(e.pointerId); } catch (err) { /* synthetische Ereignisse */ }
    if (e.clientX < window.innerWidth * 0.45 && stickId === null) {
      stickId = e.pointerId; stickX = e.clientX; stickY = e.clientY;
      const b = $('stickBasis'); b.style.display = 'block'; b.style.left = stickX + 'px'; b.style.top = stickY + 'px';
      $('stickKnopf').style.transform = 'translate(0,0)';
    } else if (blickId === null) {
      blickId = e.pointerId; blickX = e.clientX; blickY = e.clientY; blickBewegt = 0; blickStart = performance.now(); haltAusgeloest = false;
      clearTimeout(haltTimer);
      haltTimer = setTimeout(() => { if (blickId !== null && blickBewegt < 14) { haltAusgeloest = true; setzen(); if (navigator.vibrate) navigator.vibrate(15); } }, 380);
    }
  });
  tl.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - stickX, dy = e.clientY - stickY;
      const l = Math.hypot(dx, dy), max = 55;
      if (l > max) { dx = dx / l * max; dy = dy / l * max; }
      achse.x = dx / max; achse.z = dy / max;
      if (Math.hypot(achse.x, achse.z) < 0.15) { achse.x = 0; achse.z = 0; }
      $('stickKnopf').style.transform = `translate(${dx}px,${dy}px)`;
    } else if (e.pointerId === blickId) {
      const dx = e.clientX - blickX, dy = e.clientY - blickY;
      blickX = e.clientX; blickY = e.clientY; blickBewegt += Math.abs(dx) + Math.abs(dy);
      spieler.yaw -= dx * 0.0062;
      spieler.pitch = Math.max(-1.55, Math.min(1.55, spieler.pitch - dy * 0.0062));
    }
  });
  const touchEnde = e => {
    if (e.pointerId === stickId) { stickId = null; achse.x = 0; achse.z = 0; $('stickBasis').style.display = 'none'; }
    else if (e.pointerId === blickId) {
      clearTimeout(haltTimer);
      if (blickBewegt < 14 && !haltAusgeloest && performance.now() - blickStart < 380) abbauen();
      blickId = null;
    }
  };
  tl.addEventListener('pointerup', touchEnde); tl.addEventListener('pointercancel', touchEnde);
  const knopf = (id, ab, auf) => {
    const el = $(id);
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); ab(); });
    if (auf) { el.addEventListener('pointerup', e => { e.stopPropagation(); auf(); }); el.addEventListener('pointercancel', () => auf()); el.addEventListener('pointerleave', () => auf()); }
  };
  knopf('tSpringen', () => taste({ code: 'Space' }, true), () => taste({ code: 'Space' }, false));
  knopf('tMenue', () => pauseZeigen());
  knopf('tInv', () => inventarUmschalten());
  knopf('tChat', () => chatOeffnen());

  /* ---------- Menues ---------- */
  function setzeVollbildTeile(an) {
    $('hud').style.display = an ? 'block' : 'none';
    $('hotbar').style.display = an ? 'flex' : 'none';
    $('touch').classList.toggle('an', an && touch);
    $('tChat').style.display = modus === 'online' ? 'grid' : 'none';
  }
  function pauseZeigen() {
    if (!spielLaeuft || ueberlagerung) return;
    ueberlagerung = true;
    $('pauseText').textContent = modus === 'online' ? 'Du bist online. Die Welt läuft für alle weiter.' : 'Deine Einzelwelt wird automatisch gespeichert.';
    $('sicht2').value = String(sicht);
    $('pause').classList.add('offen');
    for (const k in eing) eing[k] = false;
    achse.x = achse.z = 0;
    sicherSolo(); sichereOnline();
  }
  function pauseSchliessen() {
    $('pause').classList.remove('offen'); ueberlagerung = false;
    if (!touch) sperren();
  }
  $('bWeiter').addEventListener('click', pauseSchliessen);
  $('bMenue').addEventListener('click', () => zumMenue(''));
  function sichtSetzen(v) { sicht = Number(v) || 6; ls.set('sicht', sicht); letzterChunkX = 1e9; szene.fog.near = sicht * CX * 0.5; szene.fog.far = sicht * CX * 0.95; }
  $('sicht2').addEventListener('change', e => { sichtSetzen(e.target.value); $('sicht').value = String(sicht); });
  $('sicht').addEventListener('change', e => { sichtSetzen(e.target.value); });

  function zumMenue(text) {
    sicherSolo(); sichereOnline();
    spielLaeuft = false; ueberlagerung = false; chatOffen = false;
    if (document.pointerLockElement) document.exitPointerLock();
    if (ws) { const s = ws; ws = null; try { s.close(); } catch (e) { /* egal */ } }
    clearInterval(sendeTimer);
    for (const id of [...andere.keys()]) andereEntfernen(id);
    for (const c of [...chunks.values()]) chunkLoeschen(c);
    markierung.visible = false;
    $('pause').classList.remove('offen'); $('inventar').classList.remove('offen'); $('chateingabe').style.display = 'none';
    $('chatlog').innerHTML = '';
    setzeVollbildTeile(false);
    $('menue').classList.add('offen');
    $('fehler').textContent = text || '';
    menueAktualisieren();
    szene.background = null;
  }
  function menueAktualisieren() {
    const s = soloLesen();
    $('bSolo').textContent = s ? 'Einzelwelt weiterspielen' : 'Alleine spielen';
    $('bNeu').style.display = s ? 'block' : 'none';
    $('bOnline').disabled = false; $('bSolo').disabled = false;
  }

  function starten(art, daten) {
    modus = art;
    $('menue').classList.remove('offen');
    spielLaeuft = true; ueberlagerung = false;
    sichtSetzen(sicht);
    hotbarZeichnen(); zeigeName();
    setzeVollbildTeile(true);
    letzterChunkX = 1e9;
    // Startposition: erst die Welt rund um den Startpunkt erzeugen
    let p = daten.pos || startPosition();
    spieler.x = p.x; spieler.y = p.y; spieler.z = p.z;
    spieler.vx = spieler.vy = spieler.vz = 0; spieler.fliegen = false;
    spieler.yaw = daten.yaw || 0; spieler.pitch = daten.pitch || 0;
    if (daten.pos) freiStellen();
    chunksAktualisieren(true);
    meshArbeit(40);
    listeZeichnen();
    if (!touch) sperren();
    ziel = null; editsGeaendert = false; sicherungsZeit = performance.now();
  }

  $('spielerName').value = ls.get('name', '');
  $('sicht').value = String(sicht);
  if (![...$('sicht').options].some(o => o.value === String(sicht))) { sicht = touch ? 4 : 8; $('sicht').value = String(sicht); }
  $('hilfeDesktop').style.display = touch ? 'none' : 'block';
  $('hilfeTouch').style.display = touch ? 'block' : 'none';
  inventarBauen();

  $('bSolo').addEventListener('click', () => {
    ls.set('name', $('spielerName').value.trim());
    const s = soloLesen();
    if (s) {
      weltLaden(s.seed, s.a); tageszeit = Number(s.zeit) || 0.06;
      starten('solo', { pos: { x: s.x, y: s.y, z: s.z }, yaw: s.yaw, pitch: s.pitch });
    } else { neueSoloWelt(); }
  });
  function neueSoloWelt() {
    weltLaden(Math.floor(Math.random() * 2e9), []); tageszeit = 0.06;
    starten('solo', {});
    sicherSolo();
  }
  $('bNeu').addEventListener('click', () => {
    if (confirm('Deine bisherige Einzelwelt wird gelöscht. Wirklich eine neue anlegen?')) neueSoloWelt();
  });
  $('bOnline').addEventListener('click', async () => {
    const name = $('spielerName').value.trim().slice(0, 14) || 'Spieler';
    ls.set('name', name);
    $('fehler').textContent = '';
    $('bOnline').disabled = true; $('bSolo').disabled = true;
    $('bOnline').textContent = 'Verbinde …';
    try {
      const m = await verbinden(name);
      meineId = m.id;
      weltLaden(m.seed, m.a);
      zeitOffset = m.zeit - Date.now();
      modus = 'online';
      starten('online', {});
      for (const o of m.spieler) andereHinzu(o.id, o.name, o);
      listeZeichnen();
      chatZeile('', 'Willkommen in Quaderland, ' + name + '! Mit T schreibst du in den Chat.', true);
      // Gratis-Server vergessen die Welt manchmal: eigene Sicherung anbieten, falls die Welt leer ist
      if (m.neu) {
        try {
          const sic = JSON.parse(ls.get('sicherung', 'null'));
          if (sic && Number.isInteger(sic.seed) && Array.isArray(sic.a) && sic.a.length) ws.send(JSON.stringify({ t: 'sicherung', seed: sic.seed, a: sic.a }));
        } catch (e) { /* keine Sicherung */ }
      }
      clearInterval(sendeTimer);
      sendeTimer = setInterval(() => {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'pos', x: +spieler.x.toFixed(2), y: +spieler.y.toFixed(2), z: +spieler.z.toFixed(2), ry: +spieler.yaw.toFixed(2), rp: +spieler.pitch.toFixed(2) }));
      }, 100);
    } catch (err) {
      if (ws) { try { ws.close(); } catch (e) { /* egal */ } ws = null; }
      $('fehler').textContent = err.message || 'Verbindung fehlgeschlagen.';
    }
    $('bOnline').textContent = 'Online-Welt betreten';
    $('bOnline').disabled = false; $('bSolo').disabled = false;
  });
  menueAktualisieren();

  /* ---------- Hauptschleife ---------- */
  let letzte = performance.now(), fpsZaehler = 0, fpsZeit = 0, fps = 0, infoZeit = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - letzte) / 1000); letzte = t;
    if (!spielLaeuft) { renderer.setClearColor(0x0f1a2b); renderer.render(szene, kamera); return; }

    if (!ueberlagerung && !chatOffen) physik(dt);
    if (modus === 'online') tageszeit = (((Date.now() + zeitOffset) / 1000) % DAUER) / DAUER;
    else if (!ueberlagerung) tageszeit = (tageszeit + dt / DAUER) % 1;

    chunksAktualisieren(false);
    meshArbeit(5);
    andereAktualisieren(dt);

    kamera.position.set(spieler.x, spieler.y + AUGE, spieler.z);
    kamera.rotation.set(spieler.pitch, spieler.yaw, 0);
    himmelAktualisieren();
    if (!ueberlagerung) {
      zielen();
      if (mausLinks) { mausZeit -= dt; if (mausZeit <= 0) { abbauen(); mausZeit = 0.2; } }
    }
    // Unter Wasser: dunkler blauer Nebel
    const unterWasser = getBlock(Math.floor(spieler.x), Math.floor(spieler.y + AUGE), Math.floor(spieler.z)) === W.WASSER;
    if (unterWasser) { szene.fog.near = 1; szene.fog.far = 22; szene.fog.color.setRGB(0.1, 0.25, 0.5); szene.background = szene.fog.color; }
    else { szene.fog.near = sicht * CX * 0.5; szene.fog.far = sicht * CX * 0.95; }
    renderer.render(szene, kamera);

    fpsZaehler++; fpsZeit += dt;
    if (fpsZeit >= 0.5) { fps = Math.round(fpsZaehler / fpsZeit); fpsZaehler = 0; fpsZeit = 0; }
    infoZeit += dt;
    if (infoZeit > 0.25 && $('info').style.display === 'block') {
      infoZeit = 0;
      $('info').textContent = `Quaderland · ${fps} FPS\nX ${spieler.x.toFixed(1)}  Y ${spieler.y.toFixed(1)}  Z ${spieler.z.toFixed(1)}\nChunks ${chunks.size}  Warteschlange ${warteschlange.length}\nUhrzeit ${Math.floor(((tageszeit * 24 + 6) % 24))}:00` + (modus === 'online' ? `\nSpieler ${andere.size + 1}` : '');
    }
    // Automatisches Speichern
    if (performance.now() - sicherungsZeit > 15000) {
      sicherungsZeit = performance.now();
      if (editsGeaendert) { sicherSolo(); sichereOnline(); }
      else if (modus === 'solo') sicherSolo();
    }
  }
  requestAnimationFrame(frame);
  window.addEventListener('beforeunload', () => { sicherSolo(); sichereOnline(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { sicherSolo(); sichereOnline(); } });

  // Fuer Tests
  window.quaderland = { W, getBlock, setBlock, spieler, chunks, get ziel() { return ziel; }, kamera, szene, renderer, meshArbeit, chunksAktualisieren, abbauen, setzen, hotbar, andere, get ws() { return ws; } };
})();
