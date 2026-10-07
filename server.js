'use strict';
// Quaderland - Server: liefert das Spiel aus und haelt die gemeinsame Online-Welt (WebSocket unter /ws).
// Die Welt selbst entsteht aus einer Zahl (seed) im Browser. Der Server merkt sich nur,
// welche Bloecke Spieler veraendert haben, und verteilt Positionen, Bloecke und Chat.
// Tiere und Zombies rechnet der Server selbst (tiere.js), damit alle dieselben sehen.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Welt = require('./welt');
const Tiere = require('./tiere');
const zugang = require('./zugang')({ titel: 'Quaderland' });

const PORT = Number(process.env.PORT) || 10900;
const DATEN = process.env.DATEN_VERZEICHNIS || path.join(__dirname, 'daten');
const DATEI = path.join(DATEN, 'welt.json');
const MAX_SPIELER = 16;
const MAX_AENDERUNGEN = 400_000;
const REICHWEITE = 12;
const GRENZE = 200_000;

const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};
const DATEIEN = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/spiel.js', 'spiel.js'], ['/welt.js', 'welt.js'],
  ['/texturen.js', 'texturen.js'], ['/dinge.js', 'dinge.js'], ['/tiere.js', 'tiere.js'], ['/datenschutz', 'datenschutz.html'], ['/datenschutz.html', 'datenschutz.html']
]);

function senden(res, datei, cache) {
  const voll = path.join(__dirname, datei);
  if (!fs.existsSync(voll)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
  res.writeHead(200, { 'Content-Type': TYPEN[path.extname(voll)] || 'application/octet-stream', 'Cache-Control': cache });
  fs.createReadStream(voll).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname.startsWith('/datenschutz')) return senden(res, 'datenschutz.html', 'no-cache');
  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}');
  }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (zugang.pruefen(req, res)) return;
  if (req.method === 'GET' && url.pathname === '/vendor/three.min.js') return senden(res, 'vendor/three.min.js', 'public, max-age=604800');
  if (req.method === 'GET' && DATEIEN.has(url.pathname)) return senden(res, DATEIEN.get(url.pathname), 'no-cache');
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
});

/* ---------- Die gemeinsame Welt ---------- */
let seed = Math.floor(Math.random() * 2_000_000_000);
const aenderungen = new Map();   // "x,y,z" -> Block
let neu = true;                  // true, solange nie etwas gespeichert/hochgeladen wurde
let veraendert = false;

try {
  const j = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
  if (Number.isInteger(j.seed) && Array.isArray(j.a)) {
    seed = j.seed;
    for (let i = 0; i + 3 < j.a.length; i += 4) aenderungen.set(j.a[i] + ',' + j.a[i + 1] + ',' + j.a[i + 2], j.a[i + 3]);
    neu = false;
    console.log(`Welt geladen: seed ${seed}, ${aenderungen.size} Aenderungen`);
  }
} catch (e) { /* keine gespeicherte Welt */ }

function flach() {
  const a = [];
  for (const [k, b] of aenderungen) { const p = k.split(','); a.push(+p[0], +p[1], +p[2], b); }
  return a;
}
function speichern() {
  if (!veraendert) return;
  veraendert = false;
  try {
    fs.mkdirSync(DATEN, { recursive: true });
    fs.writeFileSync(DATEI + '.tmp', JSON.stringify({ seed, a: flach() }));
    fs.renameSync(DATEI + '.tmp', DATEI);
  } catch (e) { console.warn('Speichern fehlgeschlagen:', e.message); veraendert = true; }
}
setInterval(speichern, 20_000).unref();
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { speichern(); process.exit(0); });

/* ---------- Welt-Zugriff fuer Tiere ---------- */
const chunkSpeicher = new Map();
function getBlock(x, y, z) {
  if (y < 0) return Welt.GRUND;
  if (y >= Welt.CH) return 0;
  const a = aenderungen.get(x + ',' + y + ',' + z);
  if (a !== undefined) return a;
  const cx = x >> 4, cz = z >> 4, k = cx + ',' + cz;
  let d = chunkSpeicher.get(k);
  if (!d) {
    if (chunkSpeicher.size > 600) chunkSpeicher.delete(chunkSpeicher.keys().next().value);
    d = Welt.chunkErzeugen(seed, cx, cz);
    chunkSpeicher.set(k, d);
  }
  return d[(x & 15) + (z & 15) * 16 + y * 256];
}
let tiere = new Tiere(getBlock);

/* ---------- Spieler ---------- */
const spieler = new Map();
let naechsteId = 1;
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8_000_000, verifyClient: ({ req }) => zugang.hatZugang(req) });

function sende(ws, m) { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
function anAlle(m, ausser) {
  const text = JSON.stringify(m);
  for (const sp of spieler.values()) if (sp.ws !== ausser) sende(sp.ws, text);
}
const ganz = v => Number.isInteger(v);
const zahl = (v, g) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= g;
function saeubern(name) {
  const n = String(name || '').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 14);
  return n || 'Spieler';
}

wss.on('connection', ws => {
  if (spieler.size >= MAX_SPIELER) { sende(ws, { t: 'fehler', text: 'Die Welt ist voll (' + MAX_SPIELER + ' Spieler).' }); return ws.close(); }
  const id = naechsteId++;
  const sp = { id, ws, name: 'Spieler', x: 0, y: 40, z: 0, ry: 0, rp: 0, neuePos: false, tokenB: 30, letzterChat: 0, drin: false, ueberleben: false, lebend: true, letzterHieb: 0 };
  const tokenTimer = setInterval(() => { sp.tokenB = Math.min(40, sp.tokenB + 20); }, 1000);

  ws.on('message', roh => {
    let m;
    try { m = JSON.parse(roh.toString()); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'hallo') {
      if (sp.drin) return;
      sp.drin = true;
      sp.name = saeubern(m.name);
      spieler.set(id, sp);
      sende(ws, {
        t: 'start', id, seed, neu: neu && aenderungen.size === 0, zeit: Date.now(),
        spieler: [...spieler.values()].filter(o => o !== sp).map(o => ({ id: o.id, name: o.name, x: o.x, y: o.y, z: o.z, ry: o.ry, rp: o.rp })),
        a: flach()
      });
      anAlle({ t: 'rein', id, name: sp.name }, ws);
      return;
    }
    if (!sp.drin) return;

    if (m.t === 'pos') {
      if (!zahl(m.x, GRENZE) || !zahl(m.y, 500) || !zahl(m.z, GRENZE) || !zahl(m.ry, 100) || !zahl(m.rp, 100)) return;
      sp.x = m.x; sp.y = m.y; sp.z = m.z; sp.ry = m.ry; sp.rp = m.rp; sp.neuePos = true;
    } else if (m.t === 'block') {
      if (!ganz(m.x) || !ganz(m.y) || !ganz(m.z) || !ganz(m.b)) return;
      if (m.y < 1 || m.y >= Welt.CH || m.b < 0 || m.b >= Welt.ANZAHL || m.b === Welt.GRUND || m.b === Welt.WASSER) return;
      if (Math.abs(m.x) > GRENZE || Math.abs(m.z) > GRENZE) return;
      if (--sp.tokenB < 0) return;
      const dx = m.x + 0.5 - sp.x, dy = m.y + 0.5 - (sp.y + 1.6), dz = m.z + 0.5 - sp.z;
      if (dx * dx + dy * dy + dz * dz > REICHWEITE * REICHWEITE) {
        sende(ws, { t: 'block', x: m.x, y: m.y, z: m.z, b: aenderungen.has(m.x + ',' + m.y + ',' + m.z) ? aenderungen.get(m.x + ',' + m.y + ',' + m.z) : -1 });
        return;
      }
      if (aenderungen.size >= MAX_AENDERUNGEN && !aenderungen.has(m.x + ',' + m.y + ',' + m.z)) return;
      aenderungen.set(m.x + ',' + m.y + ',' + m.z, m.b);
      neu = false; veraendert = true;
      anAlle({ t: 'block', x: m.x, y: m.y, z: m.z, b: m.b }, ws);
    } else if (m.t === 'zustand') {
      sp.ueberleben = m.u === true; sp.lebend = m.l !== false;
    } else if (m.t === 'hau') {
      // Spieler haut ein Tier: Abstand und Takt pruefen, Beute nur an ihn
      const j = Date.now();
      if (!ganz(m.id) || !ganz(m.s) || m.s < 1 || m.s > 8 || j - sp.letzterHieb < 250) return;
      const t = tiere.m.get(m.id);
      if (!t || (t.x - sp.x) ** 2 + (t.y - sp.y) ** 2 + (t.z - sp.z) ** 2 > 7 * 7) return;
      sp.letzterHieb = j;
      const erg = tiere.hau(m.id, m.s, sp.x, sp.z);
      if (erg && erg.beute.length) sende(ws, { t: 'beute', l: erg.beute });
    } else if (m.t === 'chat') {
      const j = Date.now();
      if (j - sp.letzterChat < 600) return;
      sp.letzterChat = j;
      const text = String(m.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 140);
      if (text) anAlle({ t: 'chat', name: sp.name, text });
    } else if (m.t === 'sicherung') {
      // Der Gratis-Server vergisst die Welt, wenn er neu startet. Wer eine Kopie hat, kann sie
      // hochladen - aber nur, solange die Welt noch ganz neu und unveraendert ist.
      if (!neu || aenderungen.size > 0) return;
      if (!ganz(m.seed) || !Array.isArray(m.a) || m.a.length % 4 !== 0 || m.a.length > MAX_AENDERUNGEN * 4) return;
      const neue = new Map();
      for (let i = 0; i < m.a.length; i += 4) {
        const x = m.a[i], y = m.a[i + 1], z = m.a[i + 2], b = m.a[i + 3];
        if (!ganz(x) || !ganz(y) || !ganz(z) || !ganz(b) || y < 1 || y >= Welt.CH || b < 0 || b >= Welt.ANZAHL) return;
        if (Math.abs(x) > GRENZE || Math.abs(z) > GRENZE) return;
        neue.set(x + ',' + y + ',' + z, b);
      }
      seed = m.seed; aenderungen.clear(); chunkSpeicher.clear(); tiere = new Tiere(getBlock);
      for (const [k, b] of neue) aenderungen.set(k, b);
      neu = false; veraendert = true;
      anAlle({ t: 'welt', seed, a: flach() });
    }
  });

  ws.on('close', () => {
    clearInterval(tokenTimer);
    if (spieler.delete(id)) anAlle({ t: 'raus', id });
  });
  ws.on('error', () => {});
});

// Positionen 10-mal pro Sekunde an alle
setInterval(() => {
  const l = [];
  for (const sp of spieler.values()) if (sp.neuePos) { sp.neuePos = false; l.push([sp.id, +sp.x.toFixed(2), +sp.y.toFixed(2), +sp.z.toFixed(2), +sp.ry.toFixed(2), +sp.rp.toFixed(2)]); }
  if (l.length) anAlle({ t: 'p', l });
}, 100).unref();

// Tiere: 10-mal pro Sekunde rechnen und verteilen (nur wenn jemand online ist)
let letzterTierTakt = Date.now();
setInterval(() => {
  const j = Date.now(), dt = Math.min(0.2, (j - letzterTierTakt) / 1000);
  letzterTierTakt = j;
  if (!spieler.size) { if (tiere.m.size) tiere.m.clear(); return; }
  const liste = [...spieler.values()].map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z, ueberleben: p.ueberleben, lebend: p.lebend }));
  const tag = Welt.tageslicht(Welt.phaseAusZeit(j));
  for (const e of tiere.schritt(dt, liste, tag)) {
    const p = spieler.get(e.ziel);
    if (p) sende(p.ws, { t: 'schaden', s: e.s, x: +e.x.toFixed(2), z: +e.z.toFixed(2) });
  }
  anAlle({ t: 'tiere', l: tiere.liste() });
}, 100).unref();

server.listen(PORT, () => console.log('Quaderland laeuft auf Port ' + PORT));
