# Cookiemaster

Ein Unterrichtsspiel zu Datensparsamkeit und Phishing.

Jedes Kind spielt einen Tag lang eine **Persona**. Jede Persona gibt es zweimal, als grüne und als orange
Version. So können zwei Kinder dieselbe Figur spielen. Im Lauf des Tages werden die Kinder immer wieder
gefragt, ob sie eine Information über ihre Persona teilen wollen (Lieblingsspiel, Sport, Schule …).
Sagt ein Kind ja, kreuzt die Lehrperson das im **Datensammelpass** der passenden Farbe an.

Am Ende des Tages fotografiert die Lehrperson die beiden Pässe, und die App wertet sie automatisch aus.
Sie zeigt dann, wie viele Phishing-Nachrichten jede Persona aufgrund der geteilten Informationen bekommen
könnte. Die Nachrichten erscheinen in einem simulierten Messenger, und die Warnzeichen lassen sich
gemeinsam besprechen.

Alle Personas, ihre Merkmale und Bilder sind frei erfunden. Die Bilder sind Illustrationen, keine Fotos
echter Kinder. Die Beispielbilder der Datensammelpässe in `assets/images/` enthalten ebenfalls nur diese
erfundenen Daten.

## Voraussetzungen

- Windows, macOS oder Linux
- [Python 3](https://www.python.org/downloads/) (getestet mit 3.14). Unter Windows bei der Installation
  **„Add python.exe to PATH“** anhaken.
- Ein aktueller Browser

## Schnellstart (Windows)

1. Projekt herunterladen (auf GitHub: **Code → Download ZIP**) und entpacken.
2. `start.bat` doppelklicken.
   - Beim ersten Start wird automatisch eine Python-Umgebung eingerichtet (Internet nötig).
   - Auf die Frage „Datensammelpässe neu auswerten?“ mit **J** oder **N** antworten.
   - Der Browser öffnet `http://localhost:8000/html/index.html`.
3. Zum Beenden das schwarze Fenster schließen.

## Manuell (alle Betriebssysteme)

```bash
python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

python generate_freigaben.py          # Pässe auswerten -> data/freigaben.json
python -m http.server 8000            # Webserver starten
```

Dann im Browser `http://localhost:8000/html/index.html` öffnen.

> **Wichtig:** `index.html` per Doppelklick zu öffnen funktioniert nicht. Die App lädt ihre Daten per
> `fetch()` und braucht deshalb einen Webserver (siehe oben).

## Ablauf im Unterricht

1. **Morgens:** Jedes Kind bekommt eine Persona in Grün oder Orange. Personas, die an diesem Tag niemand
   spielt, streicht die Lehrperson im jeweiligen Pass durch. Sie werden dann nicht angezeigt.
2. **Im Lauf des Tages:** Die Kinder werden gefragt, ob sie eine Information über ihre Persona teilen
   möchten. Bei „Ja“ kreuzt die Lehrperson das Merkmal im Pass der passenden Farbe an.
3. **Am Ende des Tages:** Beide Pässe möglichst gerade und von oben fotografieren und ablegen als
   - `assets/images/datensammelpass_gruen.jpeg`
   - `assets/images/datensammelpass_orange.jpeg`
4. `start.bat` starten und die Auswertung mit **J** bestätigen (oder `python generate_freigaben.py`).
   Die erkannte Tabelle wird in der Konsole angezeigt. Unsichere Zellen werden aufgelistet und als
   *nicht freigegeben* gespeichert.
5. **Auflösung:** In der Übersicht auf **Reload** klicken. Die Phishing-Zähler laufen hoch und die
   Personas sortieren sich danach, wie viel sie geteilt haben.
6. Eine Persona anklicken und das Postfach öffnen, um die Nachrichten und Warnzeichen zu besprechen.

**Reset** setzt in der Anzeige alle Merkmale auf „nicht freigegeben“. Die Datei bleibt dabei unverändert.

### Wenn die Erkennung danebenliegt

```bash
python generate_freigaben.py --debug
```

Das speichert `data/debug_grün.jpg` und `data/debug_orange.jpg`, auf denen das erkannte Raster und der
Tintenanteil pro Zelle eingezeichnet sind. Falsch erkannte Kreuze lassen sich auch direkt in
`data/freigaben.json` korrigieren.

## Projektstruktur

```
html/index.html               Übersicht aller Personas
html/detail.html              Detailseite einer Persona mit Phishing-Chat
script.js                     App-Logik (Daten laden, prüfen, anzeigen)
chat.js, chat.css             Messenger-Komponente
styles.css                    Allgemeines Layout
generate_freigaben.py         Wertet die Pass-Fotos aus (OpenCV)
data/Personas.csv             Personas und ihre Merkmale
data/freigaben.json           Ergebnis der Auswertung (wird erzeugt)
data/phishing_vorlagen.json   Phishing-Nachricht je Merkmal
data/Persona_Bilder/          Bilder der Personas
assets/images/                Fotos der Datensammelpässe
```

## Inhalte anpassen

- **Personas ändern:** `data/Personas.csv` bearbeiten (Trennzeichen `;`, UTF-8). Die Reihenfolge der
  Zeilen pro Farbe muss der Reihenfolge auf dem gedruckten Pass entsprechen.
- **Merkmale ändern:** Merkmale sind alle Spalten außer `Farbe`, `Name` und `Bilddatei`. Die Spalten
  müssen in derselben Reihenfolge wie auf dem Pass stehen. Für jedes Merkmal braucht es einen gleichnamigen
  Eintrag in `data/phishing_vorlagen.json`.
- **Phishing-Texte ändern:** In `data/phishing_vorlagen.json` sind `{name}` (Name der Persona) und `{wert}`
  (Wert des Merkmals) als Platzhalter erlaubt.

Nach Änderungen an Personas oder Merkmalen muss `generate_freigaben.py` erneut laufen. Abweichungen zwischen
CSV und `freigaben.json` zeigt die App als Warnung in der Statusleiste an.
