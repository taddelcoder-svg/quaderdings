'use strict';
// Tests der Olympiade-Anbindung: Punkterechnung, Ticket-Pruefung und der Server-Ablauf
// (ohne gueltiges Ticket keine Meldung, pro Ticket nur ein Versuch, Plausibilitaetsgrenzen).
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const W = require('../welt');
const O = require('../olympia');
const olymp = require('../olymp');

test('Seed ist aus der Lauf-Kennung abgeleitet und stabil', () => {
  assert.strictEqual(O.seedAus('lauf-1'), O.seedAus('lauf-1'));
  assert.notStrictEqual(O.seedAus('lauf-1'), O.seedAus('lauf-2'));
  const s = O.seedAus('irgendwas');
  assert.ok(Number.isInteger(s) && s >= 0 && s < 2000000000);
});

test('Punkte: Wert je Gegenstand, Unbekanntes zaehlt nicht', () => {
  const r = O.punkte({ [W.STAMM]: 10, [W.DIAMANT]: 2, [W.LAUB]: 50, 999: 5, [W.WERKBANK]: 3 }, 300);
  assert.strictEqual(r.punkte, 10 * 3 + 2 * 60);
  assert.strictEqual(r.stuecke, 12);
  assert.match(r.text, /150 Punkte/);
});

test('Punkte: Mengen je Gegenstand und pro Sekunde sind gedeckelt, Muell wird ignoriert', () => {
  const viel = O.punkte({ [W.DIAMANT]: 100000 }, 300);
  assert.strictEqual(viel.gewertet[W.DIAMANT], O.WERT[W.DIAMANT][1]);
  const schnell = O.punkte({ [W.ERDE]: 400, [W.SAND]: 400 }, 10);
  assert.ok(schnell.stuecke <= (10 + O.SPIELRAUM) * O.MAX_PRO_SEKUNDE);
  for (const muell of [null, undefined, 'x', 5, [], { [W.ERDE]: -4 }, { [W.ERDE]: 'abc' }, { [W.ERDE]: NaN }]) {
    assert.strictEqual(O.punkte(muell, 300).punkte, 0);
  }
});

test('Spieldauer kommt nur aus erlaubten Werten', () => {
  assert.strictEqual(O.dauerMinuten({ minuten: 8 }), 8);
  assert.strictEqual(O.dauerMinuten({ minuten: 999 }), O.DAUER_STD);
  assert.strictEqual(O.dauerMinuten(undefined), O.DAUER_STD);
});

test('Ticket-Pruefung: nur gueltige Tickets dieses Spiels', () => {
  const o = olymp({ spiel: 'quaderland' });
  const w = olymp.werkzeug();
  const basis = { sp: 'quaderland', l: 'l1', g: 0, s: 's1', n: 'Anna', m: ['s1'], u: 'http://localhost:1', c: {}, bis: Date.now() + 60000 };
  assert.ok(o.ticketPruefen(w.ausstellen(basis)));
  assert.strictEqual(o.ticketPruefen(w.ausstellen({ ...basis, sp: 'anderes' })), null);
  assert.strictEqual(o.ticketPruefen(w.ausstellen({ ...basis, bis: Date.now() - 1 })), null);
  assert.strictEqual(o.ticketPruefen(w.ausstellen(basis) + 'x'), null);
  assert.strictEqual(o.ticketPruefen('quatsch'), null);
  assert.strictEqual(o.ticketPruefen(undefined), null);
});

/* ---------- Server-Ablauf: echter Serverprozess und eine Schein-Olympiade ---------- */
function anfrage(port, pfad, daten) {
  return new Promise((ok, fehler) => {
    const text = JSON.stringify(daten);
    const r = http.request({ host: '127.0.0.1', port, path: pfad, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = {}; try { j = JSON.parse(d); } catch (e) { /* leer */ } ok({ status: res.statusCode, d: j }); });
    });
    r.on('error', fehler); r.end(text);
  });
}

test('Server: Ablauf mit Ticket, Meldung an die Olympiade, ein Versuch pro Ticket', async t => {
  const empfangen = [];
  const olympiade = http.createServer((req, res) => {
    let d = ''; req.on('data', c => d += c);
    req.on('end', () => { empfangen.push({ pfad: req.url, sig: req.headers['x-olymp-signatur'], text: d }); res.writeHead(200); res.end('{}'); });
  });
  await new Promise(ok => olympiade.listen(0, '127.0.0.1', ok));
  const oPort = olympiade.address().port;
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(port), DATEN_VERZEICHNIS: path.join(require('os').tmpdir(), 'quaderland-test-' + port), ZUGANG_PASSWORT: '' }, stdio: 'ignore' });
  t.after(() => { server.kill(); olympiade.close(); });
  for (let i = 0; i < 50; i++) { try { await anfrage(port, '/api/olymp', {}); break; } catch (e) { await new Promise(ok => setTimeout(ok, 100)); } }

  const w = olymp.werkzeug();
  const ticket = w.ausstellen({ sp: 'quaderland', l: 'lauf-test', g: 0, s: 's1', n: 'Anna', m: [{ s: 's1', n: 'Anna' }], u: 'http://127.0.0.1:' + oPort, c: { minuten: 3 }, z: 'http://127.0.0.1:' + oPort + '/', ti: 'Olympiade T', nr: 1, von: 2, bis: Date.now() + 60000 });

  // Ohne gueltiges Ticket: keine Auskunft, keine Meldung
  for (const art of ['info', 'da', 'start', 'ergebnis']) {
    const r = await anfrage(port, '/api/olymp', { art, ticket: 'kaputt', gesammelt: { [W.DIAMANT]: 5 } });
    assert.strictEqual(r.status, 403, art);
  }
  assert.strictEqual((await anfrage(port, '/api/olymp', { art: 'info', ticket: ticket.replace(/.$/, '0') })).status, 403);
  assert.strictEqual(empfangen.filter(e => e.pfad === '/api/ergebnis').length, 0);

  const info = await anfrage(port, '/api/olymp', { art: 'info', ticket });
  assert.strictEqual(info.status, 200);
  assert.strictEqual(info.d.minuten, 3);
  assert.strictEqual(info.d.seed, O.seedAus('lauf-test'));
  assert.strictEqual(info.d.info.name, 'Anna');

  assert.strictEqual((await anfrage(port, '/api/olymp', { art: 'start', ticket })).status, 200);
  // Unvollstaendige Meldung wird abgelehnt
  assert.strictEqual((await anfrage(port, '/api/olymp', { art: 'ergebnis', ticket })).status, 400);

  // Gerade erst gestartet: Der Server deckelt die Menge nach der vergangenen Zeit
  const r1 = await anfrage(port, '/api/olymp', { art: 'ergebnis', ticket, gesammelt: { [W.ERDE]: 400, [W.STAMM]: 250, [W.DIAMANT]: 25, [W.LAUB]: 99 } });
  assert.strictEqual(r1.status, 200);
  const soll = O.punkte({ [W.ERDE]: 400, [W.STAMM]: 250, [W.DIAMANT]: 25 }, 0);
  assert.strictEqual(r1.d.punkte, soll.punkte);
  assert.ok(soll.stuecke <= O.SPIELRAUM * O.MAX_PRO_SEKUNDE + 5);

  // Zweite Meldung mit demselben Ticket: 409, keine zweite Wertung
  const r2 = await anfrage(port, '/api/olymp', { art: 'ergebnis', ticket, gesammelt: { [W.DIAMANT]: 25 } });
  assert.strictEqual(r2.status, 409);
  await new Promise(ok => setTimeout(ok, 300));
  const werte = empfangen.filter(e => e.pfad === '/api/ergebnis');
  assert.strictEqual(werte.length, 1);
  const m = JSON.parse(werte[0].text);
  assert.strictEqual(m.art, 'wert'); assert.strictEqual(m.s, 's1'); assert.strictEqual(m.wert, r1.d.punkte); assert.strictEqual(m.lauf, 'lauf-test');
  assert.ok(w.meldungOk(werte[0].text, werte[0].sig), 'Meldung ist signiert');
});
