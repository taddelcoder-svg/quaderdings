'use strict';
// Quaderland - Olympiade-Disziplin "Sammel-Wettlauf": gemeinsame Regeln fuer Browser und Server.
// Alle in derselben Olympiade-Runde spielen dieselbe Welt (Seed aus der Lauf-Kennung), sammeln
// eine begrenzte Zeit lang Rohstoffe und bekommen Punkte nach Wert. Die Punkte rechnet der Server
// aus den rohen Zahlen (Anzahl je Gegenstand); der Browser schickt keine fertige Punktzahl.
// Diese Datei beruehrt weder die Welterzeugung noch die Online-Welt.
(function (root, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik(require('./welt'));
  else root.Olympia = fabrik(root.Welt);
})(this, function (W) {
  // Punkte je eingesammeltem Gegenstand (Beute nach dem Abbauen) und Obergrenze je Gegenstand.
  // Alles, was hier nicht steht, zaehlt nicht (z. B. Hergestelltes oder Laub).
  const WERT = {
    [W.ERDE]: [1, 400], [W.SAND]: [1, 400], [W.KIES]: [1, 400], [W.SCHNEE]: [1, 400],
    [W.STAMM]: [3, 250], [W.BIRKE]: [3, 250], [W.BRUCH]: [2, 400], [W.SANDSTEIN]: [2, 300], [W.KAKTUS]: [2, 150],
    [W.BLUME_ROT]: [2, 60], [W.BLUME_GELB]: [2, 60], [W.KORNBLUME]: [2, 60], [W.APFEL]: [4, 40],
    [W.KOHLE]: [8, 150], [W.EISEN]: [15, 100], [W.GOLD]: [30, 50], [W.DIAMANT]: [60, 25]
  };
  const NAMEN = { [W.KOHLE]: 'Kohle', [W.EISEN]: 'Eisen', [W.GOLD]: 'Gold', [W.DIAMANT]: 'Diamanten' };
  const DAUER_WAHL = [3, 5, 8];          // Minuten, wie in der Olympiade waehlbar
  const DAUER_STD = 5;
  const MAX_PRO_SEKUNDE = 5;             // schneller kann niemand abbauen und einsammeln
  const SPIELRAUM = 15;                  // Sekunden Toleranz fuer Netz und Countdown

  const dauerMinuten = c => (c && DAUER_WAHL.includes(Number(c.minuten)) ? Number(c.minuten) : DAUER_STD);

  // Aus der Lauf-Kennung wird eine feste Welt-Zahl: dieselbe Kennung ergibt fuer alle dieselbe Welt
  function seedAus(lauf) {
    let h = 2166136261;
    const s = String(lauf);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 2000000000;
  }

  // Die Meldung des Browsers {id: anzahl} wird gesaeubert und gedeckelt.
  // sekunden = Zeit, die der Spieler hoechstens gespielt haben kann.
  function punkte(gesammelt, sekunden) {
    const erlaubt = Math.max(0, Math.floor((sekunden + SPIELRAUM) * MAX_PRO_SEKUNDE));
    const roh = [];
    if (gesammelt && typeof gesammelt === 'object') {
      for (const id of Object.keys(WERT)) {
        const n = Math.floor(Number(gesammelt[id]));
        if (Number.isFinite(n) && n > 0) roh.push([Number(id), Math.min(n, WERT[id][1])]);
      }
    }
    // Ist die Gesamtzahl unmoeglich hoch, werden alle Mengen im gleichen Verhaeltnis gekuerzt
    const summe = roh.reduce((a, [, n]) => a + n, 0);
    const faktor = summe > erlaubt ? erlaubt / summe : 1;
    let pkt = 0, stuecke = 0;
    const gewertet = {};
    for (const [id, n] of roh) {
      const m = Math.floor(n * faktor);
      if (m <= 0) continue;
      gewertet[id] = m; stuecke += m; pkt += m * WERT[id][0];
    }
    const teile = [stuecke + ' Rohstoffe'];
    for (const id of [W.DIAMANT, W.GOLD, W.EISEN, W.KOHLE]) if (gewertet[id]) teile.push(gewertet[id] + ' ' + NAMEN[id]);
    return { punkte: pkt, stuecke, gewertet, text: pkt.toLocaleString('de-DE') + ' Punkte · ' + teile.slice(0, 3).join(' · ') };
  }

  return { WERT, DAUER_WAHL, DAUER_STD, MAX_PRO_SEKUNDE, SPIELRAUM, dauerMinuten, seedAus, punkte };
});
