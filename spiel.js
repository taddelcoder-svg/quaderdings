'use strict';
// Quaderland - Client: Chunks, Licht, Meshing, Physik, Ueberleben, Tiere, Steuerung, Online
(function () {
  const W = Welt, D = Dinge, CX = W.CX, CH = W.CH;
  const $ = id => document.getElementById(id);
  const touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  const BR = 0.3, HOCH = 1.8, AUGE = 1.62, REICH = 6, REICH_HAU = 3.6;

  /* ---------- Speicher im Browser (darf fehlen) ---------- */
  const ls = {
    get(k, vor) { try { const v = localStorage.getItem('quaderland.' + k); return v == null ? vor : v; } catch (e) { return vor; } },
    set(k, v) { try { localStorage.setItem('quaderland.' + k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('quaderland.' + k); } catch (e) { /* egal */ } }
  };
  const jsonLesen = (k) => { try { return JSON.parse(ls.get(k, 'null')); } catch (e) { return null; } };

  /* ---------- three.js ---------- */
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
  const szene = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(72, 1, 0.08, 700);
  kamera.rotation.order = 'YXZ';
  szene.add(kamera);
  function groesse() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    kamera.aspect = window.innerWidth / window.innerHeight;
    kamera.updateProjectionMatrix();
  }
  window.addEventListener('resize', groesse); groesse();
  szene.fog = new THREE.Fog(0x87ceeb, 40, 100);

  const atlasCanvas = Texturen.atlas();
  const atlasTex = new THREE.CanvasTexture(atlasCanvas);
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.generateMipmaps = false;

  // Block-Shader: Textur x Schatten/AO x Licht (Himmelslicht wird mit der Tageszeit skaliert, Blocklicht ist warm)
  const uniforms = {
    karte: { value: atlasTex }, tag: { value: 1 }, himmelTon: { value: new THREE.Color(1, 1, 1) },
    nebelFarbe: { value: new THREE.Color(0x87ceeb) }, nebelNah: { value: 40 }, nebelFern: { value: 100 },
    deckkraft: { value: 1 }, schnitt: { value: 0.5 }
  };
  const VS = `
    attribute vec3 farbe; attribute vec2 licht;
    varying vec2 vUv; varying vec3 vFarbe; varying vec2 vLicht; varying float vTiefe;
    void main() {
      vUv = uv; vFarbe = farbe; vLicht = licht;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vTiefe = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const FS = `
    uniform sampler2D karte; uniform float tag; uniform vec3 himmelTon; uniform vec3 nebelFarbe;
    uniform float nebelNah; uniform float nebelFern; uniform float deckkraft; uniform float schnitt;
    varying vec2 vUv; varying vec3 vFarbe; varying vec2 vLicht; varying float vTiefe;
    void main() {
      vec4 t = texture2D(karte, vUv);
      if (t.a < schnitt) discard;
      float s = pow(0.8, (1.0 - vLicht.x) * 15.0) * tag;
      float b = pow(0.8, (1.0 - vLicht.y) * 15.0);
      vec3 l = max(himmelTon * s, vec3(1.0, 0.84, 0.62) * b);
      l = max(l, vec3(0.025));
      vec3 c = t.rgb * vFarbe * l;
      c = mix(c, nebelFarbe, smoothstep(nebelNah, nebelFern, vTiefe));
      gl_FragColor = vec4(c, t.a * deckkraft);
    }`;
  const matBlock = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS });
  const wasserUniforms = Object.assign({}, uniforms, { deckkraft: { value: 0.74 }, schnitt: { value: 0.01 } });
  const matWasser = new THREE.ShaderMaterial({ uniforms: wasserUniforms, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });

  // Himmel: Sonne, Mond, Sterne, Wolken
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
  const WOLKEN_GROESSE = 1024;
  const wolkenTex = new THREE.CanvasTexture(Texturen.wolken(7));
  wolkenTex.magFilter = THREE.NearestFilter; wolkenTex.minFilter = THREE.NearestFilter; wolkenTex.generateMipmaps = false;
  wolkenTex.wrapS = wolkenTex.wrapT = THREE.RepeatWrapping;
  const wolken = new THREE.Mesh(new THREE.PlaneGeometry(WOLKEN_GROESSE, WOLKEN_GROESSE),
    new THREE.MeshBasicMaterial({ map: wolkenTex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  wolken.rotation.x = -Math.PI / 2; wolken.renderOrder = 2;
  szene.add(wolken);

  // Markierung des angezielten Blocks, Risse beim Abbauen
  const markierung = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 }));
  markierung.visible = false;
  szene.add(markierung);
  const risseTex = new THREE.CanvasTexture(Texturen.risse());
  risseTex.magFilter = THREE.NearestFilter; risseTex.minFilter = THREE.NearestFilter; risseTex.generateMipmaps = false;
  risseTex.repeat.set(1 / 8, 1);
  const risse = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01),
    new THREE.MeshBasicMaterial({ map: risseTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, fog: false }));
  risse.visible = false;
  szene.add(risse);

  // Partikel beim Abbauen
  const partikelGeo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
  const partikel = [];
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(partikelGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.visible = false; szene.add(m);
    partikel.push({ m, vx: 0, vy: 0, vz: 0, t: 0 });
  }
  let partikelIndex = 0;
  function partikelSpruehen(x, y, z, b, hell) {
    const t = W.TAB[b]; if (!t || !t[3]) return;
    const f = Texturen.mittelfarben[t[3]] || [1, 1, 1];
    for (let i = 0; i < 10; i++) {
      const p = partikel[partikelIndex++ % partikel.length];
      p.m.visible = true; p.t = 0.5 + Math.random() * 0.4;
      p.m.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
      p.vx = (Math.random() - 0.5) * 3; p.vy = 1.5 + Math.random() * 2.5; p.vz = (Math.random() - 0.5) * 3;
      p.m.material.color.setRGB(f[0] * hell, f[1] * hell, f[2] * hell);
    }
  }
  function partikelBewegen(dt) {
    for (const p of partikel) {
      if (!p.m.visible) continue;
      p.t -= dt;
      if (p.t <= 0) { p.m.visible = false; continue; }
      p.vy -= 18 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(Math.min(1, p.t * 2.5));
    }
  }

  /* ---------- Bloecke und Symbole ---------- */
  const KACHEL = W.TAB.map(t => t[1] ? [Texturen.index(t[1]), Texturen.index(t[2]), Texturen.index(t[3])] : null);
  const ART = W.TAB.map(t => t[4]);
  const FORM = W.TAB.map(t => t[5]);
  const { OPAK, FEST, LICHT, DAEMPFUNG, PFLANZE } = W;
  const symbole = {};
  function symbolVon(id) {
    if (symbole[id]) return symbole[id];
    let c;
    if (id < W.ANZAHL) c = FORM[id] === 'w' ? Texturen.symbol(atlasCanvas, W.TAB[id][1], W.TAB[id][3], 64) : Texturen.flachSymbol(atlasCanvas, W.TAB[id][1], 64);
    else { const s = D.info(id).symbol; c = Texturen.gegenstandSymbol(s.form, s.farbe, 64); }
    symbole[id] = c;
    return c;
  }
  function symbolKopie(id) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    c.getContext('2d').drawImage(symbolVon(id), 0, 0);
    return c;
  }
  const name = id => D.info(id).name;

  /* ---------- Welt / Chunks ---------- */
  let seed = 1;
  const chunks = new Map();     // Schluessel -> Chunk {cx, cz, k, data, mesh, wasser, bau, licht}
  const edits = new Map();      // Chunk-Schluessel -> Map(Index -> Block)
  let editsGeaendert = false;
  let warteschlange = [];
  let letzterChunkX = 1e9, letzterChunkZ = 1e9;
  let sicht = Number(ls.get('sicht', touch ? 4 : 8)) || 6;
  const ck = (cx, cz) => (cx + 0x8000) * 0x10000 + (cz + 0x8000);
  const neuerChunk = (cx, cz, k) => ({ cx, cz, k, data: null, mesh: null, wasser: null, bau: false, licht: null });

  function chunkMitDaten(cx, cz) {
    const k = ck(cx, cz);
    let c = chunks.get(k);
    if (!c) { c = neuerChunk(cx, cz, k); chunks.set(k, c); }
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
  // Licht an einer Stelle: [Himmel 0..15, Block 0..15]
  function lichtBei(x, y, z) {
    if (y >= CH) return [15, 0];
    if (y < 0) return [0, 0];
    const c = chunks.get(ck(x >> 4, z >> 4));
    if (!c || !c.licht) return [15, 0];
    const v = c.licht[(x & 15) + (z & 15) * CX + y * CX * CX];
    return [v >> 4, v & 15];
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
    // Licht reicht bis 14 Bloecke weit: Nachbar-Chunks im Umkreis mit neu bauen
    neuBauen(c);
    const nahX = lx < 14 ? -1 : 0, fernX = lx > 1 ? 1 : 0, nahZ = lz < 14 ? -1 : 0, fernZ = lz > 1 ? 1 : 0;
    for (let dz = nahZ; dz <= fernZ; dz++) for (let dx = nahX; dx <= fernX; dx++) {
      if (!dx && !dz) continue;
      const n = chunks.get(ck(cx + dx, cz + dz));
      if (n && n.bau) neuBauenSpaeter(n);
    }
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
    for (const m of [c.mesh, c.wasser]) if (m) { szene.remove(m); m.geometry.dispose(); }
    c.mesh = c.wasser = null;
    chunks.delete(c.k);
  }
  function weltLaden(neuerSeed, flach) {
    for (const c of [...chunks.values()]) chunkLoeschen(c);
    edits.clear(); warteschlange = []; spaeter.clear(); letzterChunkX = 1e9;
    seed = neuerSeed;
    for (let i = 0; i + 3 < flach.length; i += 4) {
      const x = flach[i], y = flach[i + 1], z = flach[i + 2];
      const k = ck(x >> 4, z >> 4);
      let e = edits.get(k); if (!e) { e = new Map(); edits.set(k, e); }
      e.set((x & 15) + (z & 15) * CX + y * CX * CX, flach[i + 3]);
    }
    editsGeaendert = false;
    tiereLokal = null;
  }
  const spaeter = new Set();
  function neuBauen(c) {
    // Chunks im Sichtbereich sofort neu bauen, damit Bauen und Abbauen ohne Verzoegerung wirkt
    if (c.bau) { spaeter.delete(c); baueMesh(c); }
    else if (!warteschlange.includes(c)) warteschlange.push(c);
  }
  function neuBauenSpaeter(c) { spaeter.add(c); }

  /* ---------- Licht und Meshing ---------- */
  // Fuer jeden Chunk wird ein Bereich mit 14 Bloecken Rand (Licht-Reichweite) betrachtet.
  const M = 14, S = CX + 2 * M, SS = S * S;
  const RB = new Uint8Array(SS * CH), RS = new Uint8Array(SS * CH), RL = new Uint8Array(SS * CH);
  const Q = new Int32Array(SS * CH);
  let qKopf = 0, qEnde = 0;
  const qRein = i => { Q[qEnde] = i; qEnde = qEnde + 1 === Q.length ? 0 : qEnde + 1; };
  function ausbreiten(L) {
    while (qKopf !== qEnde) {
      const i = Q[qKopf]; qKopf = qKopf + 1 === Q.length ? 0 : qKopf + 1;
      const l = L[i];
      if (l < 2) continue;
      const y = (i / SS) | 0, r = i - y * SS, z = (r / S) | 0, x = r - z * S;
      for (let k = 0; k < 6; k++) {
        let n;
        if (k === 0) { if (x === 0) continue; n = i - 1; }
        else if (k === 1) { if (x === S - 1) continue; n = i + 1; }
        else if (k === 2) { if (z === 0) continue; n = i - S; }
        else if (k === 3) { if (z === S - 1) continue; n = i + S; }
        else if (k === 4) { if (y === 0) continue; n = i - SS; }
        else { if (y === CH - 1) continue; n = i + SS; }
        const d = DAEMPFUNG[RB[n]];
        if (d === 255) continue;
        const nl = l - 1 - d;
        if (nl > L[n]) { L[n] = nl; qRein(n); }
      }
    }
  }
  function bereichFuellen(c) {
    const nb = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nb.push(chunkMitDaten(c.cx + dx, c.cz + dz).data);
    let top = 0;
    for (let z = 0; z < S; z++) {
      const wz = z - M, qz = wz < 0 ? 0 : wz >= CX ? 2 : 1, lz = (wz + CX) & 15;
      for (let x = 0; x < S; x++) {
        const wx = x - M, qx = wx < 0 ? 0 : wx >= CX ? 2 : 1, lx = (wx + CX) & 15;
        const d = nb[qz * 3 + qx], src = lx + lz * CX, dst = x + z * S;
        for (let y = 0; y < CH; y++) {
          const b = d[src + y * 256];
          RB[dst + y * SS] = b;
          if (b && y > top) top = y;
        }
      }
    }
    return top;
  }
  function lichtRechnen(top) {
    // Himmelslicht faellt senkrecht, dann seitlich ausbreiten
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const col = x + z * S; let l = 15;
      for (let y = CH - 1; y >= 0; y--) {
        const i = col + y * SS;
        if (y > top) { RS[i] = 15; continue; }
        const d = DAEMPFUNG[RB[i]];
        if (d === 255) l = 0; else if (d) l = Math.max(0, l - d);
        RS[i] = l;
      }
    }
    qKopf = qEnde = 0;
    const obere = Math.min(CH - 1, top + 1);
    for (let y = 0; y <= obere; y++) {
      for (let z = 0; z < S; z++) {
        for (let x = 0; x < S; x++) {
          const i = x + z * S + y * SS, l = RS[i];
          if (l < 2) continue;
          if ((x > 0 && RS[i - 1] < l - 1 && DAEMPFUNG[RB[i - 1]] !== 255) || (x < S - 1 && RS[i + 1] < l - 1 && DAEMPFUNG[RB[i + 1]] !== 255) ||
              (z > 0 && RS[i - S] < l - 1 && DAEMPFUNG[RB[i - S]] !== 255) || (z < S - 1 && RS[i + S] < l - 1 && DAEMPFUNG[RB[i + S]] !== 255)) qRein(i);
        }
      }
    }
    ausbreiten(RS);
    RL.fill(0, 0, (obere + 1) * SS);
    if (obere + 1 < CH) RL.fill(0, (obere + 1) * SS);
    qKopf = qEnde = 0;
    for (let i = 0, n = (obere + 1) * SS; i < n; i++) { const e = LICHT[RB[i]]; if (e) { RL[i] = e; qRein(i); } }
    ausbreiten(RL);
  }

  const E3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const ECKEN = [[0, 0], [1, 0], [1, 1], [0, 1]], ECKEN_R = [[0, 1], [1, 1], [1, 0], [0, 0]];
  const AOF = [0.5, 0.68, 0.84, 1];
  const ATLAS_B = Texturen.SPALTEN * Texturen.ZELLE, ATLAS_H = Texturen.ZEILEN * Texturen.ZELLE, PXT = Texturen.PX, ZEL = Texturen.ZELLE, RND = Texturen.RAND;
  const neuerPuffer = () => ({ p: [], f: [], l: [], u: [], i: [], n: 0 });

  function baueMesh(c) {
    c.bau = true;
    chunkMitDaten(c.cx, c.cz);
    const top = bereichFuellen(c);
    lichtRechnen(top);
    const B = (x, y, z) => y < 0 ? W.GRUND : y >= CH ? 0 : RB[x + z * S + y * SS];
    const LS = (x, y, z) => y >= CH ? 15 : y < 0 ? 0 : RS[x + z * S + y * SS];
    const LB = (x, y, z) => y >= CH || y < 0 ? 0 : RL[x + z * S + y * SS];
    const op = neuerPuffer(), wa = neuerPuffer();

    // Viereck mit beliebigen Ecken; uv in Kachel-Pixeln (0..16, y nach unten)
    function viereck(buf, ecken, uvs, kachel, hell, ls, lb, beidseitig) {
      const col = kachel % Texturen.SPALTEN, row = Math.floor(kachel / Texturen.SPALTEN);
      const basis = buf.n;
      for (let k = 0; k < 4; k++) {
        buf.p.push(ecken[k][0], ecken[k][1], ecken[k][2]);
        buf.u.push((col * ZEL + RND + uvs[k][0]) / ATLAS_B, 1 - (row * ZEL + RND + uvs[k][1]) / ATLAS_H);
        const h = Math.round(255 * hell); buf.f.push(h, h, h);
        buf.l.push(ls * 17, lb * 17);
      }
      buf.i.push(basis, basis + 1, basis + 2, basis, basis + 2, basis + 3);
      if (beidseitig) buf.i.push(basis, basis + 2, basis + 1, basis, basis + 3, basis + 2);
      buf.n += 4;
    }

    function flaeche(buf, x, y, z, n, s, kachel, schatten, wasser, wasserKante) {
      const u = (n + 1) % 3, v = (n + 2) % 3, en = E3[n], eu = E3[u], ev = E3[v];
      const bx = x + s * en[0], by = y + s * en[1], bz = z + s * en[2];
      const ecken = s > 0 ? ECKEN : ECKEN_R;
      const ao = [3, 3, 3, 3], lsk = [0, 0, 0, 0], lbk = [0, 0, 0, 0];
      const fs = LS(bx, by, bz), fb = LB(bx, by, bz);
      for (let k = 0; k < 4; k++) {
        if (wasser) { lsk[k] = fs; lbk[k] = fb; continue; }
        const cu = ecken[k][0], cv = ecken[k][1], du = cu ? 1 : -1, dv = cv ? 1 : -1;
        const x1 = bx + du * eu[0], y1 = by + du * eu[1], z1 = bz + du * eu[2];
        const x2 = bx + dv * ev[0], y2 = by + dv * ev[1], z2 = bz + dv * ev[2];
        const x3 = x1 + dv * ev[0], y3 = y1 + dv * ev[1], z3 = z1 + dv * ev[2];
        const o1 = OPAK[B(x1, y1, z1)], o2 = OPAK[B(x2, y2, z2)], o3 = OPAK[B(x3, y3, z3)];
        ao[k] = (o1 && o2) ? 0 : 3 - (o1 + o2 + o3);
        let ss = fs, sb = fb, m = 1;
        if (!o1) { ss += LS(x1, y1, z1); sb += LB(x1, y1, z1); m++; }
        if (!o2) { ss += LS(x2, y2, z2); sb += LB(x2, y2, z2); m++; }
        if (!(o1 && o2) && !o3) { ss += LS(x3, y3, z3); sb += LB(x3, y3, z3); m++; }
        lsk[k] = ss / m; lbk[k] = sb / m;
      }
      const col = kachel % Texturen.SPALTEN, row = Math.floor(kachel / Texturen.SPALTEN), ein = 0.02, br = PXT - 2 * ein;
      const basis = buf.n;
      for (let k = 0; k < 4; k++) {
        const cu = ecken[k][0], cv = ecken[k][1];
        const vx = x - M + en[0] * (s > 0 ? 1 : 0) + eu[0] * cu + ev[0] * cv;
        let vy = y + en[1] * (s > 0 ? 1 : 0) + eu[1] * cu + ev[1] * cv;
        const vz = z - M + en[2] * (s > 0 ? 1 : 0) + eu[2] * cu + ev[2] * cv;
        if (wasserKante && vy > y + 0.5) vy -= 0.12;
        buf.p.push(vx, vy, vz);
        let su, tu;
        if (n === 0) { su = cv; tu = cu; } else { su = cu; tu = cv; }
        buf.u.push((col * ZEL + RND + ein + su * br) / ATLAS_B, 1 - (row * ZEL + RND + ein + (1 - tu) * br) / ATLAS_H);
        const h = Math.round(255 * schatten * AOF[ao[k]]);
        buf.f.push(h, h, h);
        buf.l.push(Math.round(lsk[k] * 17), Math.round(lbk[k] * 17));
      }
      if (ao[0] + ao[2] > ao[1] + ao[3]) buf.i.push(basis, basis + 1, basis + 2, basis, basis + 2, basis + 3);
      else buf.i.push(basis + 1, basis + 2, basis + 3, basis + 1, basis + 3, basis);
      buf.n += 4;
    }

    function kreuz(x, y, z, kachel) {
      const ox = x - M, oz = z - M, ls = LS(x, y, z), lb = LB(x, y, z);
      const a = 0.15, e = 0.85;
      const uv = [[0, 16], [16, 16], [16, 0], [0, 0]];
      viereck(op, [[ox + a, y, oz + a], [ox + e, y, oz + e], [ox + e, y + 1, oz + e], [ox + a, y + 1, oz + a]], uv, kachel, 0.92, ls, lb, true);
      viereck(op, [[ox + a, y, oz + e], [ox + e, y, oz + a], [ox + e, y + 1, oz + a], [ox + a, y + 1, oz + e]], uv, kachel, 0.92, ls, lb, true);
    }
    function fackel(x, y, z, kachel) {
      const ox = x - M, oz = z - M, ls = LS(x, y, z), lb = 15;
      const a = 7 / 16, e = 9 / 16, h = 10 / 16;
      const X0 = ox + a, X1 = ox + e, Z0 = oz + a, Z1 = oz + e, Y0 = y, Y1 = y + h;
      const seite = [[7, 16], [9, 16], [9, 6], [7, 6]];
      viereck(op, [[X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1]], seite, kachel, 1, ls, lb);
      viereck(op, [[X1, Y0, Z0], [X0, Y0, Z0], [X0, Y1, Z0], [X1, Y1, Z0]], seite, kachel, 1, ls, lb);
      viereck(op, [[X1, Y0, Z1], [X1, Y0, Z0], [X1, Y1, Z0], [X1, Y1, Z1]], seite, kachel, 1, ls, lb);
      viereck(op, [[X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0]], seite, kachel, 1, ls, lb);
      viereck(op, [[X0, Y1, Z1], [X1, Y1, Z1], [X1, Y1, Z0], [X0, Y1, Z0]], [[7, 8], [9, 8], [9, 6], [7, 6]], kachel, 1, ls, lb);
    }

    for (let y = 0; y <= Math.min(top, CH - 1); y++) {
      for (let z = M; z < M + CX; z++) {
        for (let x = M; x < M + CX; x++) {
          const b = RB[x + z * S + y * SS];
          if (!b) continue;
          const art = ART[b], kt = KACHEL[b], form = FORM[b];
          if (form === 'x') { kreuz(x, y, z, kt[2]); continue; }
          if (form === 'f') { fackel(x, y, z, kt[2]); continue; }
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
              if (art === 'w') flaeche(wa, x, y, z, n, s, kachel, schatten, true, B(x, y + 1, z) !== W.WASSER);
              else flaeche(op, x, y, z, n, s, kachel, schatten, false, false);
            }
          }
        }
      }
    }

    // Licht des Chunks fuer Figuren merken
    if (!c.licht) c.licht = new Uint8Array(CX * CX * CH);
    for (let y = 0; y < CH; y++) for (let z = 0; z < CX; z++) {
      const q = M + (z + M) * S + y * SS, d = z * CX + y * CX * CX;
      for (let x = 0; x < CX; x++) c.licht[d + x] = (RS[q + x] << 4) | RL[q + x];
    }

    function geo(buf) {
      if (!buf.n) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf.p), 3));
      g.setAttribute('farbe', new THREE.BufferAttribute(new Uint8Array(buf.f), 3, true));
      g.setAttribute('licht', new THREE.BufferAttribute(new Uint8Array(buf.l), 2, true));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf.u), 2));
      g.setIndex(new THREE.BufferAttribute(buf.n > 65000 ? new Uint32Array(buf.i) : new Uint16Array(buf.i), 1));
      g.computeBoundingSphere();
      return g;
    }
    for (const [feld, buf, mat, ord] of [['mesh', op, matBlock, 0], ['wasser', wa, matWasser, 1]]) {
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
        if (!c) { c = neuerChunk(pcx + dx, pcz + dz, k); chunks.set(k, c); }
        if (!c.bau) liste.push([d2, c]);
      }
    }
    liste.sort((a, b) => a[0] - b[0]);
    warteschlange = liste.map(l => l[1]);
    for (const c of [...chunks.values()]) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (R + 2) * (R + 2)) { spaeter.delete(c); chunkLoeschen(c); }
    }
  }
  function meshArbeit(budgetMs) {
    const start = performance.now();
    let n = 0;
    // zuerst Nachbarn, deren Licht sich durch eine Aenderung verschoben hat
    for (const c of spaeter) {
      if (n > 0 && performance.now() - start > budgetMs) break;
      spaeter.delete(c);
      if (chunks.has(c.k) && c.bau) { baueMesh(c); n++; }
    }
    while (warteschlange.length && (n === 0 || performance.now() - start < budgetMs)) {
      const c = warteschlange.shift();
      if (!chunks.has(c.k) || c.bau) continue;
      baueMesh(c); n++;
    }
    return n;
  }

  /* ---------- Spieler ---------- */
  const spieler = { x: 0, y: 40, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, boden: false, fliegen: false, imWasser: false, fallStart: undefined };
  const eing = { vor: false, rueck: false, links: false, rechts: false, spring: false, runter: false, laufen: false };
  const achse = { x: 0, z: 0 };
  // Kreativ: Hotbar aus Block-IDs. Ueberleben: echtes Inventar (Felder 0..8 = Hotbar)
  const kreativHotbar = (ls.get('hotbar', '') || '').split(',').map(Number).filter(n => W.PLATZIERBAR.includes(n));
  const STANDARD_HOTBAR = [W.GRAS, W.ERDE, W.STEIN, W.BRUCH, W.BRETTER, W.STAMM, W.GLAS, W.FACKEL, W.LAMPE];
  while (kreativHotbar.length < 9) kreativHotbar.push(STANDARD_HOTBAR[kreativHotbar.length]);
  kreativHotbar.length = 9;
  let inv = new D.Inventar();
  let gewaehlt = 0;
  let spielLaeuft = false, modus = 'solo';
  let spielmodus = ls.get('spielmodus', 'kreativ') === 'ueberleben' ? 'ueberleben' : 'kreativ';
  const ueberleben = () => spielmodus === 'ueberleben';
  let tageszeit = 0.06, zeitOffset = 0;
  const leben = { hp: 20, luft: 10, tot: false, schutz: 0, letzterSchaden: 0, regen: 0, ertrinken: 0, kaktus: 0 };

  // Was liegt in der Hand? -> ID oder 0
  function inHand() {
    if (!ueberleben()) return kreativHotbar[gewaehlt];
    const s = inv.f[gewaehlt];
    return s ? s.id : 0;
  }

  const kollision = (x, y, z) => W.kollidiert(getBlock, x, y, z, BR, HOCH);
  function startPosition() {
    const p = W.startpunkt(seed);
    const y = W.oberster(getBlock, p.x, p.z);
    return { x: p.x + 0.5, y: y + 1.01, z: p.z + 0.5 };
  }
  function freiStellen() {
    for (let i = 0; i < CH && kollision(spieler.x, spieler.y, spieler.z); i++) spieler.y += 1;
  }
  function physikSchritt(dt) {
    const s = spieler;
    const kopfY = Math.floor(s.y + 1.4), fussY = Math.floor(s.y + 0.3);
    s.imWasser = getBlock(Math.floor(s.x), fussY, Math.floor(s.z)) === W.WASSER || getBlock(Math.floor(s.x), kopfY, Math.floor(s.z)) === W.WASSER;
    if (s.fliegen && ueberleben()) s.fliegen = false;
    let ax = (eing.rechts ? 1 : 0) - (eing.links ? 1 : 0) + achse.x, az = (eing.rueck ? 1 : 0) - (eing.vor ? 1 : 0) + achse.z;
    const l = Math.hypot(ax, az);
    if (l > 1) { ax /= l; az /= l; }
    const renn = eing.laufen || stickLaufen;
    let tempo = s.fliegen ? (renn ? 22 : 11) : (renn ? 5.9 : 4.3);
    if (s.imWasser && !s.fliegen) tempo *= 0.6;
    const sn = Math.sin(s.yaw), cs = Math.cos(s.yaw);
    const wx = (ax * cs + az * sn) * tempo, wz = (-ax * sn + az * cs) * tempo;
    const k = Math.min(1, (s.fliegen ? 8 : s.boden ? 14 : 4) * dt);
    s.vx += (wx - s.vx) * k; s.vz += (wz - s.vz) * k;

    if (s.fliegen) {
      const ziel = ((eing.spring ? 1 : 0) - (eing.runter ? 1 : 0)) * (renn ? 14 : 8);
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
    const nx = s.x + s.vx * dt;
    if (!kollision(nx, s.y, s.z)) s.x = nx;
    else { if (s.boden && bewegt && !kollision(nx, s.y + 1.0, s.z) && !s.fliegen) { s.vy = 8.2; s.boden = false; } s.vx = 0; }
    const nz = s.z + s.vz * dt;
    if (!kollision(s.x, s.y, nz)) s.z = nz;
    else { if (s.boden && bewegt && !kollision(s.x, s.y + 1.0, nz) && !s.fliegen) { s.vy = 8.2; s.boden = false; } s.vz = 0; }
    const ny = s.y + s.vy * dt;
    const warBoden = s.boden;
    s.boden = false;
    if (!kollision(s.x, ny, s.z)) {
      s.y = ny;
      if (s.vy < 0 && s.fallStart === undefined) s.fallStart = s.y;
    } else {
      if (s.vy < 0) {
        s.y = Math.floor(ny) + 1 + 1e-4; s.boden = true;
        if (s.fliegen) s.fliegen = false;
        if (!warBoden && s.fallStart !== undefined) {
          const fall = s.fallStart - s.y;
          if (fall > 3.4) schadenNehmen(Math.floor(fall - 2.4), null);
        }
      } else s.y = Math.floor(ny + HOCH) - HOCH - 1e-4;
      s.vy = 0;
    }
    if (s.vy >= 0 || s.imWasser || s.fliegen) s.fallStart = undefined;
    if (s.y < -30) {
      if (ueberleben()) { leben.hp = 0; sterben('Du bist ins Nichts gefallen.'); }
      else { const p = startPosition(); s.x = p.x; s.y = p.y; s.z = p.z; s.vx = s.vy = s.vz = 0; meldung('Ins Nichts gefallen – zurück am Start.'); }
    }
  }
  function physik(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let i = 0; i < n; i++) physikSchritt(dt / n);
  }

  /* ---------- Leben (Ueberlebensmodus) ---------- */
  function schadenNehmen(s, von) {
    if (!ueberleben() || leben.tot || leben.schutz > 0 || s <= 0) return;
    leben.hp = Math.max(0, leben.hp - s);
    leben.schutz = 0.5; leben.letzterSchaden = performance.now();
    if (von) {
      const dx = spieler.x - von.x, dz = spieler.z - von.z, d = Math.hypot(dx, dz) || 1;
      spieler.vx = dx / d * 7; spieler.vz = dz / d * 7; spieler.vy = Math.max(spieler.vy, 5);
    }
    const blitz = $('rotblitz'); blitz.style.transition = 'none'; blitz.style.opacity = 0.45;
    requestAnimationFrame(() => { blitz.style.transition = 'opacity .5s'; blitz.style.opacity = 0; });
    if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) { /* egal */ }
    lebenZeichnen();
    if (leben.hp <= 0) sterben(von ? 'Ein Zombie hat dich erwischt.' : 'Du bist gestorben.');
  }
  function heilen(n) { leben.hp = Math.min(20, leben.hp + n); lebenZeichnen(); }
  function lebenSchritt(dt) {
    if (!ueberleben() || leben.tot) return;
    if (leben.schutz > 0) leben.schutz -= dt;
    // Ertrinken
    const kopf = getBlock(Math.floor(spieler.x), Math.floor(spieler.y + AUGE), Math.floor(spieler.z)) === W.WASSER;
    if (kopf) {
      leben.luft = Math.max(0, leben.luft - dt);
      if (leben.luft <= 0) { leben.ertrinken -= dt; if (leben.ertrinken <= 0) { leben.ertrinken = 1; schadenNehmen(2, null); } }
    } else leben.luft = Math.min(10, leben.luft + dt * 4);
    // Kaktus piekst
    leben.kaktus -= dt;
    if (leben.kaktus <= 0) {
      const s = spieler, r = BR + 0.06;
      outer: for (let y = Math.floor(s.y); y <= Math.floor(s.y + HOCH - 0.01); y++)
        for (let z = Math.floor(s.z - r); z <= Math.floor(s.z + r); z++)
          for (let x = Math.floor(s.x - r); x <= Math.floor(s.x + r); x++)
            if (getBlock(x, y, z) === W.KAKTUS) { leben.kaktus = 0.5; schadenNehmen(1, null); break outer; }
    }
    // Langsam heilen, wenn eine Weile nichts passiert ist
    if (leben.hp < 20 && performance.now() - leben.letzterSchaden > 6000) {
      leben.regen += dt;
      if (leben.regen >= 3) { leben.regen = 0; heilen(1); }
    }
  }
  function sterben(text) {
    if (leben.tot) return;
    leben.tot = true;
    abbauStop();
    $('todText').textContent = text + ' Dein Inventar bleibt erhalten.';
    ueberlagerung = true;
    if (document.pointerLockElement) document.exitPointerLock();
    $('tod').classList.add('offen');
    zustandSenden();
  }
  function wiederbeleben() {
    leben.tot = false; leben.hp = 20; leben.luft = 10;
    const p = startPosition();
    spieler.x = p.x; spieler.y = p.y; spieler.z = p.z; spieler.vx = spieler.vy = spieler.vz = 0; spieler.fallStart = undefined;
    $('tod').classList.remove('offen'); ueberlagerung = false;
    lebenZeichnen(); zustandSenden();
    if (!touch) sperren();
  }
  $('bWiederbeleben').addEventListener('click', wiederbeleben);

  // Herzen und Luftblasen als kleine Pixelbilder
  function pixelBild(maske, farben) {
    const c = document.createElement('canvas'); c.width = 9; c.height = 9;
    const g = c.getContext('2d');
    maske.forEach((zeile, y) => [...zeile].forEach((z, x) => { if (farben[z]) { g.fillStyle = farben[z]; g.fillRect(x, y, 1, 1); } }));
    return c.toDataURL();
  }
  const HERZ = ['.##...##.', '#aa#.#aa#', '#aaa#aaa#', '#aaaaaaa#', '.#aaaaa#.', '..#aaa#..', '...#a#...', '....#....', '.........'];
  const HERZ_HALB = ['.##...##.', '#aa#.#bb#', '#aaa#bbb#', '#aaaabbb#', '.#aaabb#.', '..#aab#..', '...#a#...', '....#....', '.........'];
  const BLASE = ['..###....', '.#ccc#...', '#cdccc#..', '#cdccc#..', '#ccccc#..', '.#ccc#...', '..###....', '.........', '.........'];
  const BILD = {
    voll: pixelBild(HERZ, { '#': '#1a0a0a', a: '#e0282e' }),
    halb: pixelBild(HERZ_HALB, { '#': '#1a0a0a', a: '#e0282e', b: '#4a2a2a' }),
    leer: pixelBild(HERZ, { '#': '#1a0a0a', a: '#4a2a2a' }),
    blase: pixelBild(BLASE, { '#': '#163a6a', c: '#7ab8ff', d: '#ffffff' })
  };
  function lebenZeichnen() {
    const h = $('herzen'), l = $('luft');
    const an = ueberleben() && spielLaeuft;
    h.style.display = an ? 'flex' : 'none';
    if (!an) { l.style.display = 'none'; return; }
    let html = '';
    for (let i = 0; i < 10; i++) {
      const v = leben.hp - i * 2;
      html += `<img src="${v >= 2 ? BILD.voll : v === 1 ? BILD.halb : BILD.leer}" alt="">`;
    }
    if (h.dataset.html !== html) { h.innerHTML = html; h.dataset.html = html; }
    const unter = leben.luft < 10;
    l.style.display = unter ? 'flex' : 'none';
    if (unter) {
      const n = Math.ceil(leben.luft);
      if (l.dataset.n !== String(n)) { l.dataset.n = String(n); l.innerHTML = Array.from({ length: n }, () => `<img src="${BILD.blase}" alt="">`).join(''); }
    }
    h.classList.toggle('wackeln', leben.hp <= 4);
  }

  /* ---------- Tiere ---------- */
  let tiereLokal = null;        // Einzelwelt: Tiere rechnet der Browser selbst
  const tierAnsicht = new Map(); // id -> Figur
  const ARTEN_NACH_NR = Tiere.ART_LISTE;
  function tierFigur(nr) {
    const art = ARTEN_NACH_NR[nr];
    const g = new THREE.Group();
    const mats = [];
    const teil = (b, h, t, col, x, y, z, pivotY) => {
      const geo = new THREE.BoxGeometry(b, h, t); geo.translate(0, -(pivotY || 0), 0);
      const mat = new THREE.MeshBasicMaterial({ color: col });
      mats.push([mat, new THREE.Color(col)]);
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m;
    };
    const beine = [];
    if (art === 'schaf') {
      teil(0.9, 0.75, 1.15, 0xeeeeee, 0, 0.82, 0.05);
      teil(0.46, 0.46, 0.46, 0xd8cfc4, 0, 1.05, -0.65);
      teil(0.08, 0.08, 0.02, 0x111111, -0.12, 1.1, -0.89); teil(0.08, 0.08, 0.02, 0x111111, 0.12, 1.1, -0.89);
      for (const [x, z] of [[-0.28, -0.35], [0.28, -0.35], [-0.28, 0.4], [0.28, 0.4]]) beine.push(teil(0.2, 0.48, 0.2, 0xd8cfc4, x, 0.48, z, 0.24));
    } else if (art === 'schwein') {
      teil(0.85, 0.62, 1.1, 0xf0a0a8, 0, 0.62, 0.05);
      teil(0.56, 0.56, 0.5, 0xf0a0a8, 0, 0.78, -0.7);
      teil(0.28, 0.18, 0.06, 0xd77c88, 0, 0.72, -0.97);
      teil(0.08, 0.08, 0.02, 0x111111, -0.15, 0.88, -0.96); teil(0.08, 0.08, 0.02, 0x111111, 0.15, 0.88, -0.96);
      for (const [x, z] of [[-0.25, -0.35], [0.25, -0.35], [-0.25, 0.42], [0.25, 0.42]]) beine.push(teil(0.22, 0.32, 0.22, 0xe08e98, x, 0.32, z, 0.16));
    } else if (art === 'huhn') {
      teil(0.4, 0.38, 0.52, 0xf6f6f6, 0, 0.45, 0.04);
      teil(0.26, 0.34, 0.24, 0xf6f6f6, 0, 0.72, -0.22);
      teil(0.12, 0.08, 0.14, 0xf0a020, 0, 0.72, -0.38);
      teil(0.08, 0.1, 0.06, 0xd02020, 0, 0.64, -0.36);
      teil(0.05, 0.05, 0.02, 0x111111, -0.08, 0.8, -0.35); teil(0.05, 0.05, 0.02, 0x111111, 0.08, 0.8, -0.35);
      for (const x of [-0.1, 0.1]) beine.push(teil(0.06, 0.26, 0.06, 0xe0b020, x, 0.26, 0.02, 0.13));
    } else {
      teil(0.5, 0.5, 0.5, 0x5f9e4f, 0, 1.65, 0);
      teil(0.1, 0.07, 0.02, 0x101010, -0.12, 1.68, -0.26); teil(0.1, 0.07, 0.02, 0x101010, 0.12, 1.68, -0.26);
      teil(0.5, 0.7, 0.28, 0x2f8f9f, 0, 1.4, 0, 0.35);
      const al = teil(0.22, 0.7, 0.22, 0x5f9e4f, -0.36, 1.35, 0, 0.3); al.rotation.x = -Math.PI / 2;
      const ar = teil(0.22, 0.7, 0.22, 0x5f9e4f, 0.36, 1.35, 0, 0.3); ar.rotation.x = -Math.PI / 2;
      beine.push(teil(0.24, 0.7, 0.26, 0x3a3a8a, -0.13, 0.7, 0, 0.35));
      beine.push(teil(0.24, 0.7, 0.26, 0x3a3a8a, 0.13, 0.7, 0, 0.35));
    }
    szene.add(g);
    return { g, mats, beine, art, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, ry: 0, tr: 0, verletzt: 0, phase: Math.random() * 6, neu: true };
  }
  function tierEntfernen(id) {
    const t = tierAnsicht.get(id); if (!t) return;
    szene.remove(t.g); t.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    tierAnsicht.delete(id);
  }
  function tiereAusListe(l) {
    const da = new Set();
    for (const [id, nr, x, y, z, ry, verletzt] of l) {
      da.add(id);
      let t = tierAnsicht.get(id);
      if (!t) { t = tierFigur(nr); tierAnsicht.set(id, t); }
      t.tx = x; t.ty = y; t.tz = z; t.tr = ry; t.verletzt = verletzt;
      if (t.neu) { t.x = x; t.y = y; t.z = z; t.ry = ry; t.neu = false; }
    }
    for (const id of [...tierAnsicht.keys()]) if (!da.has(id)) tierEntfernen(id);
  }
  const _farbe = new THREE.Color();
  // Helligkeit einer Figur aus dem Licht an ihrer Stelle
  function figurLicht(x, y, z) {
    const [s, b] = lichtBei(Math.floor(x), Math.floor(y + 0.5), Math.floor(z));
    const sk = Math.pow(0.8, 15 - s) * uniforms.tag.value, bl = Math.pow(0.8, 15 - b);
    const ton = uniforms.himmelTon.value;
    return [Math.max(0.05, ton.r * sk, bl), Math.max(0.05, ton.g * sk, bl * 0.84), Math.max(0.05, ton.b * sk, bl * 0.62)];
  }
  function tiereAktualisieren(dt) {
    const k = 1 - Math.exp(-14 * dt);
    for (const t of tierAnsicht.values()) {
      const vorX = t.x, vorZ = t.z;
      t.x += (t.tx - t.x) * k; t.y += (t.ty - t.y) * k; t.z += (t.tz - t.z) * k;
      let dr = t.tr - t.ry; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
      t.ry += dr * k;
      const v = Math.hypot(t.x - vorX, t.z - vorZ) / Math.max(dt, 0.001);
      t.phase += v * dt * 3.5;
      const sw = Math.sin(t.phase) * Math.min(1, v / 1.5) * 0.7;
      t.beine.forEach((b, i) => { b.rotation.x = (i % 2 === (i < 2 ? 0 : 1) ? 1 : -1) * sw; });
      t.g.position.set(t.x, t.y, t.z); t.g.rotation.y = t.ry;
      const l = figurLicht(t.x, t.y, t.z);
      for (const [mat, basis] of t.mats) {
        _farbe.copy(basis);
        if (t.verletzt) _farbe.lerp(new THREE.Color(1, 0.2, 0.2), 0.6);
        mat.color.setRGB(_farbe.r * l[0], _farbe.g * l[1], _farbe.b * l[2]);
      }
    }
  }
  // Strahl gegen Tier-Kisten: liefert {id, t} des naechsten Treffers
  function tierImVisier(o, d, max) {
    let best = null;
    for (const [id, t] of tierAnsicht) {
      const a = Tiere.ARTEN[t.art];
      const min = [t.x - a.b, t.y, t.z - a.b], mx = [t.x + a.b, t.y + a.h, t.z + a.b];
      let t0 = 0, t1 = max;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) { if (o[k] < min[k] || o[k] > mx[k]) { t0 = Infinity; break; } continue; }
        let a1 = (min[k] - o[k]) / d[k], a2 = (mx[k] - o[k]) / d[k];
        if (a1 > a2) { const z = a1; a1 = a2; a2 = z; }
        t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < max && (!best || t0 < best.t)) best = { id, t: t0 };
    }
    return best;
  }

  /* ---------- Zielen ---------- */
  function strahl(ox, oy, oz, dx, dy, dz, max) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = dx > 0 ? (x + 1 - ox) / dx : dx < 0 ? (ox - x) / -dx : Infinity;
    let ty = dy > 0 ? (y + 1 - oy) / dy : dy < 0 ? (oy - y) / -dy : Infinity;
    let tz = dz > 0 ? (z + 1 - oz) / dz : dz < 0 ? (oz - z) / -dz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 40; i++) {
      const b = getBlock(x, y, z);
      if (b !== 0 && b !== W.WASSER) return { x, y, z, nx, ny, nz, b, t };
      if (tx < ty && tx < tz) { if (tx > max) break; t = tx; x += sx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { if (ty > max) break; t = ty; y += sy; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { if (tz > max) break; t = tz; z += sz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
  let ziel = null, zielTier = null;
  function blickRichtung() {
    const cp = Math.cos(spieler.pitch);
    return [-Math.sin(spieler.yaw) * cp, Math.sin(spieler.pitch), -Math.cos(spieler.yaw) * cp];
  }
  // Touch: gezielt wird dorthin, wo der Finger liegt (nicht auf die Bildmitte)
  let fingerXY = null, bauModus = false;
  const _v = new THREE.Vector3();
  function fingerRichtung() {
    kamera.updateMatrixWorld();
    _v.set((fingerXY[0] / window.innerWidth) * 2 - 1, -(fingerXY[1] / window.innerHeight) * 2 + 1, 0.5).unproject(kamera).sub(kamera.position).normalize();
    return [_v.x, _v.y, _v.z];
  }
  function zielen() {
    if (touch && !fingerXY) { ziel = null; zielTier = null; markierung.visible = false; return; }
    const d = touch ? fingerRichtung() : blickRichtung();
    const o = [spieler.x, spieler.y + AUGE, spieler.z];
    ziel = strahl(o[0], o[1], o[2], d[0], d[1], d[2], REICH);
    zielTier = tierImVisier(o, d, Math.min(REICH_HAU, ziel ? ziel.t + 0.01 : REICH_HAU));
    if (!ziel || zielTier) { markierung.visible = false; return; }
    markierung.visible = true;
    if (touch && bauModus) {
      // Vorschau: dort, wo der neue Block hinkommt
      markierung.position.set(ziel.x + ziel.nx + 0.5, ziel.y + ziel.ny + 0.5, ziel.z + ziel.nz + 0.5);
      markierung.material.color.setHex(0xffffff); markierung.material.opacity = 0.95;
    } else {
      markierung.position.set(ziel.x + 0.5, ziel.y + 0.5, ziel.z + 0.5);
      markierung.material.color.setHex(0x000000); markierung.material.opacity = 0.7;
    }
  }
  function schicke(m) { if (modus === 'online' && ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function blockAendern(x, y, z, b) {
    setBlock(x, y, z, b);
    schicke({ t: 'block', x, y, z, b });
  }

  /* ---------- Abbauen, Setzen, Hauen, Essen ---------- */
  function beuteEinsammeln(liste) {
    if (!ueberleben()) return;
    for (const [id, n] of liste) {
      const rest = inv.hinzu(id, n);
      if (rest < n) meldungKlein('+' + (n - rest) + ' ' + name(id));
      if (rest > 0) meldung('Dein Inventar ist voll.');
    }
    hotbarZeichnen();
  }
  // Block wirklich entfernen (mit Beute, Partikeln und Pflanzen obendrauf)
  function brechen(x, y, z) {
    const b = getBlock(x, y, z);
    if (!b || b === W.GRUND) return false;
    const l = lichtBei(x, y + 1, z);
    partikelSpruehen(x, y, z, b, Math.max(0.15, Math.pow(0.8, 15 - Math.max(l[0] * uniforms.tag.value, l[1]))));
    blockAendern(x, y, z, 0);
    if (ueberleben()) {
      const a = D.abbau(b, inHand());
      beuteEinsammeln(D.beute(b, a.ernte));
      const w = D.werkzeug(inHand());
      if (w && W.TAB[b][6] > 0 && w.typ !== 'w') { if (inv.abnutzen(gewaehlt)) meldung('Dein Werkzeug ist zerbrochen.'); hotbarZeichnen(); }
    }
    // Pflanzen und Fackeln obendrauf fallen mit
    const oben = getBlock(x, y + 1, z);
    if (W.BRAUCHT_BODEN[oben]) {
      blockAendern(x, y + 1, z, 0);
      if (ueberleben()) beuteEinsammeln(D.beute(oben, true));
    }
    return true;
  }
  let hauSperre = 0;
  function hauen() {
    if (!zielTier || hauSperre > 0) return false;
    hauSperre = 0.4;
    const s = D.schaden(inHand());
    if (modus === 'online') schicke({ t: 'hau', id: zielTier.id, s });
    else if (tiereLokal) {
      const erg = tiereLokal.hau(zielTier.id, s, spieler.x, spieler.z);
      if (erg && erg.beute.length) beuteEinsammeln(erg.beute);
    }
    if (ueberleben() && D.werkzeug(inHand())) { if (inv.abnutzen(gewaehlt)) meldung('Dein Werkzeug ist zerbrochen.'); hotbarZeichnen(); }
    return true;
  }
  // Abbau-Fortschritt (Ueberleben)
  let abbau = null, abbauPause = 0;
  function abbauStop() { abbau = null; risse.visible = false; }
  function abbauSchritt(dt) {
    if (abbauPause > 0) { abbauPause -= dt; return; }
    if (!ziel || zielTier) { abbauStop(); return; }
    if (!abbau || abbau.x !== ziel.x || abbau.y !== ziel.y || abbau.z !== ziel.z || abbau.b !== ziel.b || abbau.hand !== inHand()) {
      abbau = { x: ziel.x, y: ziel.y, z: ziel.z, b: ziel.b, hand: inHand(), f: 0, zeit: D.abbau(ziel.b, inHand()).zeit };
    }
    if (!Number.isFinite(abbau.zeit)) { abbauStop(); return; }
    abbau.f += dt;
    const stufe = Math.min(7, Math.floor(abbau.f / Math.max(0.01, abbau.zeit) * 8));
    risseTex.offset.x = stufe / 8;
    risse.position.set(abbau.x + 0.5, abbau.y + 0.5, abbau.z + 0.5);
    risse.visible = abbau.zeit > 0.1;
    if (abbau.f >= abbau.zeit) {
      brechen(abbau.x, abbau.y, abbau.z);
      abbauStop(); abbauPause = 0.15;
      return true;
    }
    return false;
  }
  // Sofort abbauen (Kreativ) - liefert true, wenn etwas weg ist
  function abbauen() {
    zielen();
    if (zielTier) return hauen();
    if (!ziel || ziel.b === W.GRUND || ziel.y < 1) return false;
    if (ueberleben()) {
      // Pflanzen und Fackeln gehen auch im Ueberlebensmodus sofort kaputt
      if (D.abbau(ziel.b, inHand()).zeit > 0.05) return false;
    }
    return brechen(ziel.x, ziel.y, ziel.z);
  }
  function setzen() {
    zielen();
    const hand = inHand();
    // Essen
    if (ueberleben() && hand && D.info(hand).essen) {
      if (leben.hp >= 20) { meldung('Du bist schon ganz gesund.'); return false; }
      heilen(D.info(hand).essen); inv.nimm(gewaehlt, 1); hotbarZeichnen();
      meldungKlein('Mmh, ' + name(hand) + '!');
      return true;
    }
    if (!ziel || !hand || hand >= W.ANZAHL || !W.PLATZIERBAR.includes(hand)) return false;
    const x = ziel.x + ziel.nx, y = ziel.y + ziel.ny, z = ziel.z + ziel.nz;
    if (y < 1 || y >= CH) return false;
    const alt = getBlock(x, y, z);
    if (alt !== 0 && alt !== W.WASSER && !PFLANZE[alt]) return false;
    if (FEST[hand] && spielerBlockUeberlappt(x, y, z)) { if (touch) meldung('Da stehst du selbst.'); return false; }
    if (W.BRAUCHT_BODEN[hand]) {
      const unten = getBlock(x, y - 1, z);
      if (!OPAK[unten]) { meldung(name(hand) + ' braucht festen Boden.'); return false; }
      if (PFLANZE[hand] && hand !== W.FACKEL && unten !== W.GRAS && unten !== W.ERDE) { meldung('Pflanzen wachsen nur auf Gras oder Erde.'); return false; }
    }
    if (alt && PFLANZE[alt] && ueberleben()) beuteEinsammeln(D.beute(alt, true));
    blockAendern(x, y, z, hand);
    if (ueberleben()) { inv.nimm(gewaehlt, 1); hotbarZeichnen(); }
    return true;
  }
  function waehlen() {
    zielen();
    if (!ziel || !W.PLATZIERBAR.includes(ziel.b)) return;
    if (ueberleben()) {
      const i = inv.f.findIndex((s, k) => k < 9 && s && s.id === ziel.b);
      if (i >= 0) { gewaehlt = i; hotbarZeichnen(); zeigeName(); }
      return;
    }
    const i = kreativHotbar.indexOf(ziel.b);
    if (i >= 0) gewaehlt = i; else kreativHotbar[gewaehlt] = ziel.b;
    hotbarZeichnen(); zeigeName();
  }

  /* ---------- Hotbar und Inventar ---------- */
  const hotbarEl = $('hotbar');
  let nameTimer = 0;
  function slotInhalt(el, s) {
    if (!s) return;
    el.appendChild(symbolKopie(s.id));
    if (s.n > 1) { const n = document.createElement('b'); n.className = 'n'; n.textContent = s.n; el.appendChild(n); }
    const w = D.werkzeug(s.id);
    if (w && s.abn) {
      const hb = document.createElement('span'); hb.className = 'hb';
      const rest = 1 - s.abn / w.haltbar;
      hb.style.setProperty('--rest', rest); hb.style.setProperty('--farbe', `hsl(${Math.round(rest * 120)},80%,50%)`);
      el.appendChild(hb);
    }
  }
  function hotbarZeichnen() {
    hotbarEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'slot' + (i === gewaehlt ? ' an' : '');
      if (ueberleben()) slotInhalt(d, inv.f[i]);
      else d.appendChild(symbolKopie(kreativHotbar[i]));
      const z = document.createElement('i'); z.textContent = i + 1; d.appendChild(z);
      d.addEventListener('pointerdown', e => { e.stopPropagation(); gewaehlt = i; hotbarZeichnen(); zeigeName(); if (touch) modusPassend(); });
      hotbarEl.appendChild(d);
    }
    if (!ueberleben()) ls.set('hotbar', kreativHotbar.join(','));
    if (touch) modusZeichnen();
    abbauStop();
  }
  function zeigeName() {
    const el = $('name');
    const id = inHand();
    el.textContent = id ? name(id) : '';
    el.style.opacity = id ? 1 : 0;
    clearTimeout(nameTimer); nameTimer = setTimeout(() => { el.style.opacity = 0; }, 1400);
  }
  // Kreativ: alle Bloecke zur Auswahl
  function kreativRasterBauen() {
    const r = $('raster'); r.innerHTML = '';
    W.PLATZIERBAR.forEach(b => {
      const d = document.createElement('div'); d.className = 'slot'; d.title = name(b);
      d.appendChild(symbolKopie(b));
      d.addEventListener('click', () => { kreativHotbar[gewaehlt] = b; hotbarZeichnen(); zeigeName(); });
      r.appendChild(d);
    });
  }
  // Ueberleben: Rucksack, Hotbar, Muelleimer und Rezepte
  let gehalten = -1;
  function werkbankNah() {
    const sx = Math.floor(spieler.x), sy = Math.floor(spieler.y), sz = Math.floor(spieler.z);
    for (let y = sy - 3; y <= sy + 4; y++) for (let z = sz - 4; z <= sz + 4; z++) for (let x = sx - 4; x <= sx + 4; x++) if (getBlock(x, y, z) === W.WERKBANK) return true;
    return false;
  }
  function inventarZeichnen() {
    const fuellen = (el, von, bis) => {
      el.innerHTML = '';
      for (let i = von; i < bis; i++) {
        const d = document.createElement('div');
        d.className = 'slot' + (i === gehalten ? ' gehalten' : '') + (i === gewaehlt ? ' an' : '');
        slotInhalt(d, inv.f[i]);
        if (inv.f[i]) d.title = name(inv.f[i].id);
        d.addEventListener('click', () => {
          if (gehalten < 0) { if (inv.f[i]) gehalten = i; }
          else { inv.verschiebe(gehalten, i); gehalten = -1; }
          inventarZeichnen(); hotbarZeichnen();
        });
        el.appendChild(d);
      }
    };
    fuellen($('rucksack'), 9, 36);
    fuellen($('invHotbar'), 0, 9);
    $('muell').classList.toggle('bereit', gehalten >= 0);
    // Rezepte
    const nah = werkbankNah();
    const r = $('rezepte'); r.innerHTML = '';
    const liste = D.REZEPTE.map(rz => ({ rz, kann: inv.kannHerstellen(rz) && (!rz.werkbank || nah), teil: rz.ein.some(([id]) => inv.anzahl(id) > 0) }))
      .filter(x => x.kann || x.teil || x.rz.aus === W.BRETTER || x.rz.aus === W.WERKBANK)
      .sort((a, b) => (b.kann - a.kann) || (b.teil - a.teil));
    const gesehen = new Set();
    for (const { rz, kann } of liste) {
      const key = rz.aus + ':' + rz.ein.map(e => e.join('x')).join(',');
      if (gesehen.has(key)) continue; gesehen.add(key);
      const z = document.createElement('button');
      z.type = 'button'; z.className = 'rezept' + (kann ? ' kann' : '');
      const bild = symbolKopie(rz.aus); bild.className = 'rbild'; z.appendChild(bild);
      const t = document.createElement('span'); t.className = 'rname';
      t.textContent = name(rz.aus) + (rz.n > 1 ? ' ×' + rz.n : '');
      z.appendChild(t);
      const zut = document.createElement('span'); zut.className = 'zutaten';
      for (const [id, n] of rz.ein) {
        const s = document.createElement('span');
        s.className = inv.anzahl(id) >= n ? '' : 'fehlt';
        s.appendChild(symbolKopie(id)); s.appendChild(document.createTextNode(n));
        s.title = name(id);
        zut.appendChild(s);
      }
      if (rz.werkbank) { const w = document.createElement('em'); w.textContent = nah ? '' : 'Werkbank nötig'; zut.appendChild(w); }
      z.appendChild(zut);
      z.addEventListener('click', () => {
        if (rz.werkbank && !werkbankNah()) { meldung('Dafür musst du neben einer Werkbank stehen.'); return; }
        if (!inv.herstellen(rz)) { meldung(inv.kannHerstellen(rz) ? 'Kein Platz im Inventar.' : 'Dir fehlen Zutaten.'); return; }
        meldungKlein('+' + rz.n + ' ' + name(rz.aus));
        inventarZeichnen(); hotbarZeichnen();
      });
      r.appendChild(z);
    }
  }
  $('muell').addEventListener('click', () => {
    if (gehalten < 0) return;
    inv.f[gehalten] = null; gehalten = -1;
    inventarZeichnen(); hotbarZeichnen();
  });

  /* ---------- Meldungen, Chat ---------- */
  let toastTimer = 0;
  function meldung(text) {
    const el = $('toast'); el.textContent = text; el.style.opacity = 1;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.style.opacity = 0; }, 2600);
  }
  function meldungKlein(text) {
    const box = $('beute');
    const d = document.createElement('div'); d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, 1800);
  }
  function chatZeile(nm, text, system) {
    const d = document.createElement('div');
    if (system) { d.className = 'sys'; d.textContent = text; }
    else { const b = document.createElement('b'); b.textContent = nm + ': '; d.appendChild(b); d.appendChild(document.createTextNode(text)); }
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
    if (senden && e.value.trim()) schicke({ t: 'chat', text: e.value });
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
  function avatar(id, nm) {
    const farbe = new THREE.Color().setHSL(((id * 0.137) % 1), 0.65, 0.5);
    const hose = new THREE.Color().setHSL(((id * 0.137 + 0.5) % 1), 0.35, 0.28);
    const g = new THREE.Group();
    const mats = [];
    const teil = (b, h, t, col, x, y, z, pivotY) => {
      const geo = new THREE.BoxGeometry(b, h, t); geo.translate(0, -pivotY, 0);
      const mat = new THREE.MeshBasicMaterial({ color: col });
      mats.push([mat, new THREE.Color(col)]);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); g.add(m); return m;
    };
    const kopf = teil(0.5, 0.5, 0.5, HAUT, 0, 1.55, 0, 0);
    teil(0.5, 0.7, 0.28, farbe, 0, 1.3, 0, 0.35);
    const armL = teil(0.22, 0.7, 0.22, farbe, -0.36, 1.3, 0, 0.3);
    const armR = teil(0.22, 0.7, 0.22, farbe, 0.36, 1.3, 0, 0.3);
    const beinL = teil(0.24, 0.7, 0.26, hose, -0.13, 0.7, 0, 0.35);
    const beinR = teil(0.24, 0.7, 0.26, hose, 0.13, 0.7, 0, 0.35);
    teil(0.1, 0.08, 0.02, 0x222233, -0.12, 1.6, -0.26, 0); teil(0.1, 0.08, 0.02, 0x222233, 0.12, 1.6, -0.26, 0);
    const schild = namensschild(nm); schild.position.y = 2.15; g.add(schild);
    szene.add(g);
    return { id, name: nm, g, mats, kopf, armL, armR, beinL, beinR, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, ry: 0, tr: 0, rp: 0, phase: 0, neu: true };
  }
  function andereHinzu(id, nm, p) {
    if (andere.has(id) || id === meineId) return;
    const a = avatar(id, nm);
    if (p) { a.tx = a.x = p.x; a.ty = a.y = p.y; a.tz = a.z = p.z; a.tr = a.ry = p.ry || 0; a.rp = p.rp || 0; a.neu = false; }
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
      const l = figurLicht(a.x, a.y + 1, a.z);
      for (const [mat, basis] of a.mats) mat.color.setRGB(basis.r * l[0], basis.g * l[1], basis.b * l[2]);
    }
  }
  function listeZeichnen() {
    const el = $('listeInhalt'); el.innerHTML = '';
    const namen = [ls.get('name', 'Du') + ' (du)', ...[...andere.values()].map(a => a.name)];
    for (const n of namen) { const d = document.createElement('div'); d.textContent = n; el.appendChild(d); }
  }

  /* ---------- Netzwerk ---------- */
  let ws = null, sendeTimer = 0, sicherungsZeit = 0;
  function verbinden(nm) {
    return new Promise((ok, fehler) => {
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
      let fertig = false;
      try { ws = new WebSocket(url); } catch (e) { return fehler(new Error('Verbindung nicht möglich.')); }
      const sock = ws;
      const timeout = setTimeout(() => { if (!fertig) { fertig = true; try { sock.close(); } catch (e) { /* egal */ } fehler(new Error('Der Server antwortet nicht. Versuche es gleich noch einmal.')); } }, 20000);
      sock.onopen = () => sock.send(JSON.stringify({ t: 'hallo', name: nm }));
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
          if (FEST[m.b] && spielerBlockUeberlappt(m.x, m.y, m.z)) freiStellen();
        }
        break;
      case 'chat': chatZeile(m.name, m.text, false); break;
      case 'tiere': tiereAusListe(m.l); break;
      case 'schaden': schadenNehmen(m.s, { x: m.x, z: m.z }); break;
      case 'beute': beuteEinsammeln(m.l); break;
      case 'welt': weltLaden(m.seed, m.a); chunksAktualisieren(true); freiStellen(); meldung('Welt aus einer Sicherung wiederhergestellt.'); break;
    }
  }
  function zustandSenden() { schicke({ t: 'zustand', u: ueberleben(), l: !leben.tot }); }
  function spielerBlockUeberlappt(x, y, z) {
    const s = spieler;
    return x + 1 > s.x - BR && x < s.x + BR && y + 1 > s.y && y < s.y + HOCH && z + 1 > s.z - BR && z < s.z + BR;
  }
  function sichereOnline() {
    if (modus !== 'online') return;
    ls.set('ich.online.' + seed, JSON.stringify({ inv: inv.daten(), hp: leben.hp }));
    if (!editsGeaendert) return;
    const a = aenderungFlach();
    if (!a.length) return;
    if (ls.set('sicherung', JSON.stringify({ seed, a }))) editsGeaendert = false;
  }

  /* ---------- Speichern (Einzelwelt) ---------- */
  function sicherSolo() {
    if (!spielLaeuft || modus !== 'solo') return;
    ls.set('solo', JSON.stringify({ seed, a: aenderungFlach(), x: spieler.x, y: spieler.y, z: spieler.z, yaw: spieler.yaw, pitch: spieler.pitch, zeit: tageszeit, inv: inv.daten(), hp: leben.hp }));
    editsGeaendert = false;
  }
  function soloLesen() {
    const j = jsonLesen('solo');
    return j && Number.isInteger(j.seed) && Array.isArray(j.a) ? j : null;
  }

  /* ---------- Tageszeit ---------- */
  const HIMMEL_TAG = new THREE.Color(0x87ceeb), HIMMEL_NACHT = new THREE.Color(0x060a16), HIMMEL_ROT = new THREE.Color(0xff9a5a);
  const TON_TAG = new THREE.Color(1, 1, 1), TON_NACHT = new THREE.Color(0.55, 0.62, 1), TON_ROT = new THREE.Color(1, 0.78, 0.62);
  const himmel = new THREE.Color();
  let wolkenDrift = 0;
  function himmelAktualisieren(dt) {
    const winkel = tageszeit * Math.PI * 2, hoehe = Math.sin(winkel);
    const licht = W.tageslicht(tageszeit);
    himmel.copy(HIMMEL_NACHT).lerp(HIMMEL_TAG, licht);
    const daemmerung = Math.max(0, 1 - Math.abs(hoehe) / 0.22) * 0.55;
    himmel.lerp(HIMMEL_ROT, daemmerung);
    szene.background = himmel; szene.fog.color.copy(himmel);
    uniforms.tag.value = 0.13 + 0.87 * licht;
    uniforms.himmelTon.value.copy(TON_NACHT).lerp(TON_TAG, licht).lerp(TON_ROT, daemmerung * 0.8);
    const d = 400;
    const px = kamera.position.x, py = kamera.position.y, pz = kamera.position.z;
    sonne.position.set(px + Math.cos(winkel) * d, py + Math.sin(winkel) * d, pz + 40);
    mond.position.set(px - Math.cos(winkel) * d, py - Math.sin(winkel) * d, pz + 40);
    sonne.lookAt(kamera.position); mond.lookAt(kamera.position);
    sterne.position.copy(kamera.position);
    sterne.material.opacity = Math.max(0, 1 - licht * 1.6);
    sterne.rotation.z = winkel * 0.3;
    // Wolken ziehen langsam nach Osten
    wolkenDrift += dt * 1.2;
    wolken.position.set(px, CH + 26, pz);
    wolkenTex.offset.set((px + wolkenDrift) / WOLKEN_GROESSE, -pz / WOLKEN_GROESSE);
    wolken.material.color.copy(TON_NACHT).multiplyScalar(0.25).lerp(new THREE.Color(1, 1, 1), licht).lerp(HIMMEL_ROT, daemmerung * 0.4);
  }

  /* ---------- Eingabe: Tastatur und Maus ---------- */
  function sperren() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* egal */ } }
  let ueberlagerung = false;
  let letzterSprung = 0;
  const taste = (e, an) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': eing.vor = an; break;
      case 'KeyS': case 'ArrowDown': eing.rueck = an; break;
      case 'KeyA': case 'ArrowLeft': eing.links = an; break;
      case 'KeyD': case 'ArrowRight': eing.rechts = an; break;
      case 'ShiftLeft': case 'ShiftRight': eing.laufen = an; eing.runter = an; break;
      case 'ControlLeft': eing.laufen = an; break;
      case 'Space': {
        if (an && !eing.spring && !ueberleben()) {
          const j = performance.now();
          if (j - letzterSprung < 300) { spieler.fliegen = !spieler.fliegen; spieler.vy = 0; meldung(spieler.fliegen ? 'Flugmodus an' : 'Flugmodus aus'); }
          letzterSprung = j;
        }
        eing.spring = an; break;
      }
    }
  };
  window.addEventListener('keydown', e => {
    if (!spielLaeuft || chatOffen || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    if (leben.tot) return;
    if (e.code === 'KeyE') { inventarUmschalten(); return; }
    if ($('inventar').classList.contains('offen')) { if (e.code === 'Escape') inventarUmschalten(); return; }
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
  window.addEventListener('blur', () => { for (const k in eing) eing[k] = false; mausLinks = false; });
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
    if (e.button === 0) {
      mausLinks = true; mausZeit = 0.28;
      zielen();
      if (zielTier) hauen();
      else if (!ueberleben()) abbauen();
    } else if (e.button === 2) setzen();
    else if (e.button === 1) { e.preventDefault(); waehlen(); }
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) { mausLinks = false; abbauStop(); } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('wheel', e => {
    if (!spielLaeuft || ueberlagerung || chatOffen) return;
    gewaehlt = (gewaehlt + (e.deltaY > 0 ? 1 : -1) + 9) % 9; hotbarZeichnen(); zeigeName();
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    if (spielLaeuft && document.pointerLockElement !== canvas && !ueberlagerung && !chatOffen && !touch) pauseZeigen();
  });

  function inventarUmschalten() {
    const el = $('inventar');
    if (el.classList.contains('offen')) {
      el.classList.remove('offen'); ueberlagerung = false; gehalten = -1;
      if (!touch) sperren();
    } else {
      if (leben.tot) return;
      ueberlagerung = true; abbauStop(); mausLinks = false;
      if (document.pointerLockElement) document.exitPointerLock();
      const u = ueberleben();
      $('invTitel').textContent = u ? 'Inventar' : 'Blöcke';
      $('invHinweis').textContent = u ? 'Tippe ein Feld an und dann ein anderes, um Dinge zu verschieben. Rezepte mit ⚒ brauchen eine Werkbank in der Nähe.'
        : 'Klicke einen Block, um ihn in den ausgewählten Hotbar-Platz zu legen.';
      $('raster').style.display = u ? 'none' : 'grid';
      $('invUeberleben').style.display = u ? 'grid' : 'none';
      if (u) inventarZeichnen(); else kreativRasterBauen();
      el.classList.add('offen');
    }
  }
  $('bInvZu').addEventListener('click', inventarUmschalten);
  $('bInvX').addEventListener('click', inventarUmschalten);

  /* ---------- Eingabe: Touch ---------- */
  // Linke Seite: Joystick (weit nach aussen ziehen = rennen). Rechte Seite: wischen = umsehen,
  // tippen = Aktion am getippten Block, gedrueckt halten = Aktion wiederholen bzw. abbauen.
  // Ob die Aktion Abbauen oder Bauen ist, zeigt und wechselt der grosse Modus-Knopf.
  const tl = $('touch');
  const SCHWELLE = 12;
  let stickId = null, stickX = 0, stickY = 0, stickLaufen = false;
  let blickId = null, blickX = 0, blickY = 0, blickBewegt = 0, blickStart = 0, umsehen = false, haltZeit = 0, aktionen = 0;
  let halteHinweis = false;
  const vibriere = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* egal */ } };
  function touchAktion() {
    zielen();
    const ok = bauModus ? setzen() : abbauen();
    if (ok) { aktionen++; vibriere(bauModus ? 12 : 20); }
    return ok;
  }
  tl.addEventListener('pointerdown', e => {
    if (e.target !== tl || ueberlagerung || !spielLaeuft) return;
    try { tl.setPointerCapture(e.pointerId); } catch (err) { /* synthetische Ereignisse */ }
    if (e.clientX < window.innerWidth * 0.42 && stickId === null) {
      stickId = e.pointerId; stickX = e.clientX; stickY = e.clientY;
      const b = $('stickBasis'); b.style.display = 'block'; b.style.left = stickX + 'px'; b.style.top = stickY + 'px';
      $('stickKnopf').style.transform = 'translate(0,0)';
    } else if (blickId === null) {
      blickId = e.pointerId; blickX = e.clientX; blickY = e.clientY; blickBewegt = 0; blickStart = performance.now();
      umsehen = false; haltZeit = 0; aktionen = 0;
      fingerXY = [e.clientX, e.clientY];
    }
  });
  tl.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - stickX, dy = e.clientY - stickY;
      const l = Math.hypot(dx, dy), max = 55;
      stickLaufen = l > max * 1.25;
      if (l > max) { dx = dx / l * max; dy = dy / l * max; }
      achse.x = dx / max; achse.z = dy / max;
      if (Math.hypot(achse.x, achse.z) < 0.15) { achse.x = 0; achse.z = 0; }
      $('stickKnopf').style.transform = `translate(${dx}px,${dy}px)`;
      $('stickKnopf').classList.toggle('renn', stickLaufen);
    } else if (e.pointerId === blickId) {
      const dx = e.clientX - blickX, dy = e.clientY - blickY;
      blickBewegt += Math.abs(dx) + Math.abs(dy);
      const amAbbauen = abbau && abbau.f > 0.15;
      if (!umsehen && blickBewegt > SCHWELLE && aktionen === 0 && !amAbbauen) {
        // Ab hier ist es ein Wischen: nicht mehr zielen, sondern Kamera drehen
        umsehen = true; fingerXY = null; abbauStop();
      }
      if (umsehen) {
        spieler.yaw -= dx * 0.0062;
        spieler.pitch = Math.max(-1.55, Math.min(1.55, spieler.pitch - dy * 0.0062));
      } else if (aktionen > 0 || amAbbauen) {
        fingerXY = [e.clientX, e.clientY];   // beim Halten mit dem Finger weiterziehen
      }
      blickX = e.clientX; blickY = e.clientY;
    }
  });
  const touchEnde = e => {
    if (e.pointerId === stickId) {
      stickId = null; achse.x = 0; achse.z = 0; stickLaufen = false;
      $('stickBasis').style.display = 'none'; $('stickKnopf').classList.remove('renn');
    } else if (e.pointerId === blickId) {
      const kurz = performance.now() - blickStart < 300;
      if (!umsehen && aktionen === 0 && e.type === 'pointerup' && kurz) {
        const ok = touchAktion();
        if (!ok && !bauModus && ueberleben() && ziel && !zielTier && !halteHinweis) { halteHinweis = true; meldung('Zum Abbauen den Finger auf dem Block halten.'); }
      }
      blickId = null; fingerXY = null; umsehen = false; abbauStop();
    }
  };
  tl.addEventListener('pointerup', touchEnde); tl.addEventListener('pointercancel', touchEnde);
  // Wird jedes Bild aufgerufen: Gedrueckthalten wiederholt die Aktion bzw. baut ab
  function touchHalten(dt) {
    if (blickId === null || umsehen || !fingerXY) return;
    const seit = performance.now() - blickStart;
    if (!bauModus && ueberleben()) {
      if (seit < 140) return;
      zielen();
      if (zielTier) { if (hauen()) { aktionen++; vibriere(20); } return; }
      if (abbauSchritt(dt)) { aktionen++; vibriere(20); }
      return;
    }
    if (seit < 320) return;
    haltZeit -= dt;
    if (haltZeit <= 0) { touchAktion(); haltZeit = bauModus ? 0.35 : 0.25; }
  }

  function modusZeichnen() {
    const el = $('tModus');
    el.innerHTML = '';
    const hand = inHand();
    const essen = hand && D.info(hand).essen && ueberleben();
    if (bauModus && hand) el.appendChild(symbolKopie(hand));
    else { const sp = document.createElement('span'); sp.textContent = bauModus ? '✋' : '⛏'; sp.className = 'ico'; el.appendChild(sp); }
    const t = document.createElement('small'); t.textContent = bauModus ? (essen ? 'Essen' : 'Bauen') : 'Abbauen'; el.appendChild(t);
    el.classList.toggle('bau', bauModus);
  }
  function modusSetzen(an) { bauModus = an; modusZeichnen(); }
  // Hotbar-Auswahl am Handy: Bloecke und Essen -> Bauen, Werkzeuge und leere Hand -> Abbauen
  function modusPassend() {
    const hand = inHand();
    modusSetzen(!!hand && (hand < W.ANZAHL || !!D.info(hand).essen));
  }
  const knopf = (id, ab, auf) => {
    const el = $(id);
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* egal */ } ab(); });
    if (auf) { el.addEventListener('pointerup', e => { e.stopPropagation(); auf(); }); el.addEventListener('pointercancel', () => auf()); el.addEventListener('lostpointercapture', () => auf()); }
  };
  knopf('tSpringen', () => { eing.spring = true; }, () => { eing.spring = false; });
  knopf('tRunter', () => { eing.runter = true; }, () => { eing.runter = false; });
  knopf('tModus', () => { modusSetzen(!bauModus); vibriere(8); });
  knopf('tFlug', () => {
    if (ueberleben()) { meldung('Fliegen geht nur im Kreativmodus.'); return; }
    spieler.fliegen = !spieler.fliegen; spieler.vy = 0; meldung(spieler.fliegen ? 'Flugmodus an: ▲ hoch, ▼ runter' : 'Flugmodus aus'); flugKnoepfe();
  });
  knopf('tMenue', () => pauseZeigen());
  knopf('tInv', () => inventarUmschalten());
  knopf('tChat', () => chatOeffnen());
  let flugAnzeige = null;
  function flugKnoepfe() {
    if (flugAnzeige === spieler.fliegen) return;
    flugAnzeige = spieler.fliegen;
    $('tRunter').style.display = spieler.fliegen ? 'grid' : 'none';
    $('tSpringen').textContent = spieler.fliegen ? '▲' : 'Sprung';
    $('tFlug').classList.toggle('an', spieler.fliegen);
  }

  /* ---------- Menues ---------- */
  function setzeVollbildTeile(an) {
    $('hud').style.display = an ? 'block' : 'none';
    $('hotbar').style.display = an ? 'flex' : 'none';
    $('touch').classList.toggle('an', an && touch);
    $('tChat').style.display = modus === 'online' ? 'grid' : 'none';
    $('tFlug').style.display = ueberleben() ? 'none' : 'grid';
    lebenZeichnen();
  }
  function pauseZeigen() {
    if (!spielLaeuft || ueberlagerung) return;
    ueberlagerung = true;
    abbauStop(); mausLinks = false;
    $('pauseText').textContent = modus === 'online' ? 'Du bist online. Die Welt läuft für alle weiter.' : 'Deine Einzelwelt wird automatisch gespeichert.';
    $('sicht2').value = String(sicht);
    $('spielmodus2').value = spielmodus;
    $('pause').classList.add('offen');
    for (const k in eing) eing[k] = false;
    achse.x = achse.z = 0; fingerXY = null; blickId = null; stickId = null; stickLaufen = false;
    $('stickBasis').style.display = 'none';
    sicherSolo(); sichereOnline();
  }
  function pauseSchliessen() {
    $('pause').classList.remove('offen'); ueberlagerung = false;
    if (!touch) sperren();
  }
  $('bWeiter').addEventListener('click', pauseSchliessen);
  $('bMenue').addEventListener('click', () => zumMenue(''));
  function sichtSetzen(v) { sicht = Number(v) || 6; ls.set('sicht', sicht); letzterChunkX = 1e9; }
  $('sicht2').addEventListener('change', e => { sichtSetzen(e.target.value); $('sicht').value = String(sicht); });
  $('sicht').addEventListener('change', e => { sichtSetzen(e.target.value); });
  function spielmodusSetzen(m) {
    spielmodus = m === 'ueberleben' ? 'ueberleben' : 'kreativ';
    ls.set('spielmodus', spielmodus);
    $('spielmodus').value = spielmodus; $('spielmodus2').value = spielmodus;
    if (spielLaeuft) {
      if (ueberleben()) spieler.fliegen = false;
      leben.tot = false;
      hotbarZeichnen(); setzeVollbildTeile(true); zustandSenden();
      if (touch) { modusPassend(); flugAnzeige = null; }
    }
  }
  $('spielmodus').addEventListener('change', e => spielmodusSetzen(e.target.value));
  $('spielmodus2').addEventListener('change', e => { spielmodusSetzen(e.target.value); meldung(ueberleben() ? 'Überlebensmodus: Pass auf dich auf!' : 'Kreativmodus: Alle Blöcke, Fliegen, keine Gefahr.'); });

  function zumMenue(text) {
    sicherSolo(); sichereOnline();
    spielLaeuft = false; ueberlagerung = false; chatOffen = false;
    if (document.pointerLockElement) document.exitPointerLock();
    if (ws) { const s = ws; ws = null; try { s.close(); } catch (e) { /* egal */ } }
    clearInterval(sendeTimer);
    for (const id of [...andere.keys()]) andereEntfernen(id);
    for (const id of [...tierAnsicht.keys()]) tierEntfernen(id);
    tiereLokal = null;
    for (const c of [...chunks.values()]) chunkLoeschen(c);
    markierung.visible = false; abbauStop();
    for (const id of ['pause', 'inventar', 'tod']) $(id).classList.remove('offen');
    $('chateingabe').style.display = 'none';
    $('chatlog').innerHTML = '';
    setzeVollbildTeile(false);
    $('herzen').style.display = 'none'; $('luft').style.display = 'none';
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
    leben.tot = false; leben.hp = Number.isFinite(daten.hp) && daten.hp > 0 ? Math.min(20, daten.hp) : 20; leben.luft = 10; leben.schutz = 2;
    inv = new D.Inventar(daten.inv);
    gewaehlt = 0;
    sichtSetzen(sicht);
    hotbarZeichnen(); zeigeName();
    setzeVollbildTeile(true);
    if (touch) { modusPassend(); flugAnzeige = null; }
    letzterChunkX = 1e9;
    // Startposition: erst die Welt rund um den Startpunkt erzeugen
    const p = daten.pos || startPosition();
    spieler.x = p.x; spieler.y = p.y; spieler.z = p.z;
    spieler.vx = spieler.vy = spieler.vz = 0; spieler.fliegen = false; spieler.fallStart = undefined;
    spieler.yaw = daten.yaw || 0; spieler.pitch = daten.pitch || 0;
    if (daten.pos) freiStellen();
    chunksAktualisieren(true);
    meshArbeit(40);
    listeZeichnen();
    if (art === 'solo') tiereLokal = new Tiere(getBlock);
    if (!touch) sperren();
    ziel = null; editsGeaendert = false; sicherungsZeit = performance.now();
    zustandSenden();
    if (ueberleben() && !inv.f.some(Boolean)) setTimeout(() => meldung('Überleben: Schlag Bäume, bau eine Werkbank (E) und Werkzeuge!'), 1200);
  }

  $('spielerName').value = ls.get('name', '');
  $('sicht').value = String(sicht);
  if (![...$('sicht').options].some(o => o.value === String(sicht))) { sicht = touch ? 4 : 8; $('sicht').value = String(sicht); }
  $('spielmodus').value = spielmodus;
  if (touch) document.body.classList.add('touch');
  $('hilfeDesktop').style.display = touch ? 'none' : 'block';
  $('hilfeTouch').style.display = touch ? 'block' : 'none';

  $('bSolo').addEventListener('click', () => {
    ls.set('name', $('spielerName').value.trim());
    const s = soloLesen();
    if (s) {
      weltLaden(s.seed, s.a); tageszeit = Number(s.zeit) || 0.06;
      starten('solo', { pos: { x: s.x, y: s.y, z: s.z }, yaw: s.yaw, pitch: s.pitch, inv: s.inv, hp: s.hp });
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
    const nm = $('spielerName').value.trim().slice(0, 14) || 'Spieler';
    ls.set('name', nm);
    $('fehler').textContent = '';
    $('bOnline').disabled = true; $('bSolo').disabled = true;
    $('bOnline').textContent = 'Verbinde …';
    try {
      const m = await verbinden(nm);
      meineId = m.id;
      weltLaden(m.seed, m.a);
      zeitOffset = m.zeit - Date.now();
      modus = 'online';
      const ich = jsonLesen('ich.online.' + m.seed) || {};
      starten('online', { inv: ich.inv, hp: ich.hp });
      for (const o of m.spieler) andereHinzu(o.id, o.name, o);
      listeZeichnen();
      chatZeile('', 'Willkommen in Quaderland, ' + nm + '! Mit T schreibst du in den Chat.', true);
      // Gratis-Server vergessen die Welt manchmal: eigene Sicherung anbieten, falls die Welt leer ist
      if (m.neu) {
        const sic = jsonLesen('sicherung');
        if (sic && Number.isInteger(sic.seed) && Array.isArray(sic.a) && sic.a.length) schicke({ t: 'sicherung', seed: sic.seed, a: sic.a });
      }
      clearInterval(sendeTimer);
      sendeTimer = setInterval(() => {
        schicke({ t: 'pos', x: +spieler.x.toFixed(2), y: +spieler.y.toFixed(2), z: +spieler.z.toFixed(2), ry: +spieler.yaw.toFixed(2), rp: +spieler.pitch.toFixed(2) });
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
  let letzte = performance.now(), fpsZaehler = 0, fpsZeit = 0, fps = 0, infoZeit = 0, lebenZeit = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - letzte) / 1000); letzte = t;
    if (!spielLaeuft) { renderer.setClearColor(0x0f1a2b); renderer.render(szene, kamera); return; }
    schritt(dt);
    renderer.render(szene, kamera);
  }
  function schritt(dt) {
    const aktiv = !ueberlagerung && !chatOffen;
    if (aktiv) physik(dt);
    if (modus === 'online') tageszeit = W.phaseAusZeit(Date.now() + zeitOffset);
    else if (!ueberlagerung) tageszeit = (tageszeit + dt / W.DAUER) % 1;
    if (hauSperre > 0) hauSperre -= dt;
    lebenSchritt(aktiv ? dt : 0);

    chunksAktualisieren(false);
    meshArbeit(5);
    andereAktualisieren(dt);
    if (tiereLokal && !ueberlagerung) {
      const ereignisse = tiereLokal.schritt(dt, [{ id: 0, x: spieler.x, y: spieler.y, z: spieler.z, ueberleben: ueberleben(), lebend: !leben.tot }], W.tageslicht(tageszeit));
      for (const e of ereignisse) schadenNehmen(e.s, { x: e.x, z: e.z });
      tiereAusListe(tiereLokal.liste());
    }
    tiereAktualisieren(dt);
    partikelBewegen(dt);

    kamera.position.set(spieler.x, spieler.y + AUGE, spieler.z);
    kamera.rotation.set(spieler.pitch, spieler.yaw, 0);
    himmelAktualisieren(dt);
    if (!ueberlagerung) {
      zielen();
      if (mausLinks) {
        if (ueberleben()) {
          if (zielTier) { if (hauSperre <= 0) hauen(); abbauStop(); }
          else abbauSchritt(dt);
        } else { mausZeit -= dt; if (mausZeit <= 0) { abbauen(); mausZeit = 0.2; } }
      }
      if (touch) { touchHalten(dt); flugKnoepfe(); }
    }
    // Nebel (unter Wasser dichter und blau)
    const unterWasser = getBlock(Math.floor(spieler.x), Math.floor(spieler.y + AUGE), Math.floor(spieler.z)) === W.WASSER;
    if (unterWasser) { szene.fog.near = 1; szene.fog.far = 22; szene.fog.color.setRGB(0.1, 0.25, 0.5).multiplyScalar(0.3 + 0.7 * uniforms.tag.value); szene.background = szene.fog.color; }
    else { szene.fog.near = sicht * CX * 0.5; szene.fog.far = sicht * CX * 0.95; }
    uniforms.nebelFarbe.value.copy(szene.fog.color); uniforms.nebelNah.value = szene.fog.near; uniforms.nebelFern.value = szene.fog.far;

    lebenZeit += dt;
    if (lebenZeit > 0.2) { lebenZeit = 0; lebenZeichnen(); }
    fpsZaehler++; fpsZeit += dt;
    if (fpsZeit >= 0.5) { fps = Math.round(fpsZaehler / fpsZeit); fpsZaehler = 0; fpsZeit = 0; }
    infoZeit += dt;
    if (infoZeit > 0.25 && $('info').style.display === 'block') {
      infoZeit = 0;
      const l = lichtBei(Math.floor(spieler.x), Math.floor(spieler.y + 1), Math.floor(spieler.z));
      $('info').textContent = `Quaderland · ${fps} FPS\nX ${spieler.x.toFixed(1)}  Y ${spieler.y.toFixed(1)}  Z ${spieler.z.toFixed(1)}\nChunks ${chunks.size}  Warteschlange ${warteschlange.length}\nLicht Himmel ${l[0]} Block ${l[1]}  Tiere ${tierAnsicht.size}\nUhrzeit ${Math.floor(((tageszeit * 24 + 6) % 24))}:00` + (modus === 'online' ? `\nSpieler ${andere.size + 1}` : '');
    }
    // Automatisches Speichern
    if (performance.now() - sicherungsZeit > 15000) {
      sicherungsZeit = performance.now();
      sicherSolo(); sichereOnline();
    }
  }
  requestAnimationFrame(frame);
  window.addEventListener('beforeunload', () => { sicherSolo(); sichereOnline(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { sicherSolo(); sichereOnline(); } });

  // Fuer Tests
  window.quaderland = {
    get aenderungen() { return aenderungFlach().length / 4; }, get bauModus() { return bauModus; }, W, D, getBlock, setBlock, lichtBei, spieler, chunks,
    get ziel() { return ziel; }, get zielTier() { return zielTier; }, kamera, szene, renderer, meshArbeit, chunksAktualisieren, abbauen, setzen, brechen,
    hotbar: kreativHotbar, get inv() { return inv; }, leben, andere, tierAnsicht, get tiereLokal() { return tiereLokal; }, get ws() { return ws; },
    spielmodusSetzen, schritt, set tageszeit(v) { tageszeit = v; }, get tageszeit() { return tageszeit; }, inventarUmschalten, zielen, abbauSchritt, hauen, schadenNehmen,
    set gewaehlt(v) { gewaehlt = v; hotbarZeichnen(); }, baueMesh
  };
})();
