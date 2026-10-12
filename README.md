# Quaderland

Voxel-Bauspiel im Browser (three.js) mit Kreativ- und Überlebensmodus, Einzelwelt und gemeinsamer Online-Welt.

## Starten

```
npm install
npm start          # Port 10900, oder PORT=… npm start
npm test           # Tests der Olympiade-Anbindung
```

Ohne `ZUGANG_PASSWORT` ist lokal alles offen. Auf Render schützt das gemeinsame Passwort die Seite (`zugang.js`).

## Olympiade

Quaderland ist eine Disziplin der Swimming-Lions-Olympiade (Kennung `quaderland`, Wertung „wert“: höher ist besser).
Die Olympiade öffnet das Spiel mit `?olymp=<Ticket>`. Ohne Ticket läuft alles wie gewohnt.

- **Sammel-Wettlauf**: ein Versuch, 3, 5 oder 8 Minuten (Einstellung `minuten`, Standard 5). Alle spielen im Überlebensmodus dieselbe Welt – der Seed kommt aus der Lauf-Kennung des Tickets (`olympia.js`, `seedAus`). Zombies und Tiere gibt es in diesem Modus nicht, es ist immer Tag.
- **Wertung**: Punkte nach Wert der eingesammelten Rohstoffe (z. B. Erde 1, Holz 3, Kohle 8, Eisen 15, Gold 30, Diamant 60). Selbst gesetzte Blöcke zählen beim Abbauen nicht, Hergestelltes auch nicht.
- **Server rechnet**: Der Browser meldet nur Mengen je Gegenstand an `POST /api/olymp` (`info`, `da`, `start`, `ergebnis`). Der Server prüft das signierte Ticket (`olymp.js`), deckelt Mengen je Gegenstand und pro Sekunde (seit dem gemeldeten Start, höchstens die Spielzeit) und meldet die Punktzahl mit `olymp.wertMelden` an die Olympiade. Pro Ticket zählt nur die erste Meldung (danach 409). Ohne gültiges Ticket gibt es nur 403.
- **Eigener Modus**: Der Modus `olymp` im Browser speichert nichts in Einzel- oder Online-Welt und nutzt keine WebSocket-Verbindung. Die Online-Welt-Logik im Server ist unverändert.
- Wird die Seite mitten im Versuch neu geladen, meldet sie den gespeicherten Stand; der Server begrenzt ihn nach der vergangenen Zeit.

Lokal testen: ein Ticket mit `require('./olymp').werkzeug().ausstellen({ sp: 'quaderland', l: 'lauf1', s: 's1', n: 'Name', m: [{ s: 's1', n: 'Name' }], u: 'http://localhost:10500', c: { minuten: 3 }, z: 'http://localhost:10500/', bis: Date.now() + 3600e3 })` und die Seite mit `/?olymp=<Ticket>` öffnen.

## Dateien

- `server.js` – Auslieferung, Online-Welt (WebSocket `/ws`), Olympia-Schnittstelle `/api/olymp`
- `spiel.js`, `index.html` – Client und Oberfläche
- `olympia.js` – Wertetabelle, Seed und Punkterechnung (Browser und Server)
- `olymp.js`, `zugang.js` – Vorlagen aus der Olympiade bzw. Spielesammlung (in allen Spielen gleich)
- `fonts/` – Bricolage Grotesque (SIL OFL), selbst ausgeliefert
