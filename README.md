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

## Benutzen – ohne Installation

Einfach im Browser öffnen: **https://margeonie.github.io/cookiemaster/**

Die Auswertung der Fotos läuft komplett im Browser. Die Bilder werden nirgendwo hochgeladen oder gespeichert.

## Ablauf im Unterricht

1. **Morgens:** Jedes Kind bekommt eine Persona in Grün oder Orange. Personas, die an diesem Tag niemand
   spielt, streicht die Lehrperson im jeweiligen Pass durch. Sie werden dann nicht angezeigt.
2. **Im Lauf des Tages:** Die Kinder werden gefragt, ob sie eine Information über ihre Persona teilen
   möchten. Bei „Ja“ kreuzt die Lehrperson das Merkmal im Pass der passenden Farbe an.
3. **Am Ende des Tages:** Beide Pässe möglichst gerade und von oben fotografieren. Das ganze Blatt sollte
   zu sehen sein, am besten auf einem dunkleren Untergrund.
4. In der App beim **grünen** und beim **orangen Datensammelpass** jeweils das Foto auswählen und auf
   **Laden** klicken. Beim ersten Mal wird die Bilderkennung geladen (ca. 10 MB), danach dauert die
   Auswertung einige Sekunden.
5. **Auflösung:** Die Phishing-Zähler laufen hoch, und die Personas sortieren sich danach, wie viel sie
   geteilt haben.
6. Eine Persona anklicken und das Postfach öffnen, um die Nachrichten und Warnzeichen zu besprechen.

Unter **Erkannte Kreuze prüfen** zeigt die App, was sie auf den Fotos erkannt hat. Unsichere Kreuze sind
mit **?** markiert und zählen als *nicht freigegeben*. Ist etwas falsch erkannt, hilft meist ein neues,
geraderes Foto.

Das Ergebnis bleibt im Browser gespeichert, bis neue Pässe geladen werden. Solange noch keine Pässe
geladen wurden, zeigt die App Beispieldaten. **Laden** ohne ausgewählte Fotos spielt die Auflösung noch
einmal ab. **Reset** setzt die Anzeige auf „nichts freigegeben“.

## Lokal starten (optional)

Für alle, die die App ohne Internet oder mit eigenen Inhalten verwenden möchten.

**Windows:** Projekt herunterladen (auf GitHub: **Code → Download ZIP**), entpacken und `start.bat`
doppelklicken. Dafür muss [Python 3](https://www.python.org/downloads/) installiert sein (bei der
Installation **„Add python.exe to PATH“** anhaken). Python dient hier nur als kleiner Webserver.

**Andere Systeme:**

```bash
python -m http.server 8000
```

Dann im Browser `http://localhost:8000/html/index.html` öffnen.

> **Wichtig:** `index.html` per Doppelklick zu öffnen funktioniert nicht. Die App lädt ihre Daten per
> `fetch()` und braucht deshalb einen Webserver.

## Inhalte anpassen

- **Personas ändern:** `data/Personas.csv` bearbeiten (Trennzeichen `;`, UTF-8). Die Reihenfolge der
  Zeilen pro Farbe muss der Reihenfolge auf dem gedruckten Pass entsprechen.
- **Merkmale ändern:** Merkmale sind alle Spalten außer `Farbe`, `Name` und `Bilddatei`. Die Spalten
  müssen in derselben Reihenfolge wie auf dem Pass stehen. Für jedes Merkmal braucht es einen gleichnamigen
  Eintrag in `data/phishing_vorlagen.json`.
- **Phishing-Texte ändern:** In `data/phishing_vorlagen.json` sind `{name}` (Name der Persona) und `{wert}`
  (Wert des Merkmals) als Platzhalter erlaubt.

Die Bilderkennung erwartet eine Tabelle mit einer Kopfzeile (Merkmale) und einer Namensspalte. Anzahl der
Zeilen und Spalten ergibt sich aus `Personas.csv`.

## Für Entwickler:innen

Die Bilderkennung gibt es zweimal mit identischer Logik:

- `pass-scanner.js` – läuft im Browser (OpenCV.js, liegt in `vendor/`) und wird von der App verwendet.
- `generate_freigaben.py` – dieselbe Erkennung in Python. Damit werden die Beispieldaten in
  `data/freigaben.json` erzeugt, und mit `--debug` lässt sich die Erkennung untersuchen.

Wer Schwellenwerte oder den Ablauf ändert, muss das in **beiden** Dateien tun.

```bash
python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

python generate_freigaben.py           # Fotos aus assets/images/ -> data/freigaben.json
python generate_freigaben.py --debug   # zusätzlich data/debug_grün.jpg und data/debug_orange.jpg
```

Die Debug-Bilder zeigen das erkannte Raster und den Tintenanteil pro Zelle.

### Projektstruktur

```
index.html                    Weiterleitung auf html/index.html (für GitHub Pages)
html/index.html               Übersicht mit Upload der Datensammelpässe
html/detail.html              Detailseite einer Persona mit Phishing-Chat
script.js                     App-Logik (Daten laden, prüfen, anzeigen)
pass-scanner.js               Bilderkennung im Browser
vendor/opencv.js              OpenCV für den Browser (Apache 2.0)
chat.js, chat.css             Messenger-Komponente
styles.css                    Allgemeines Layout
generate_freigaben.py         Bilderkennung in Python (Beispieldaten, Fehlersuche)
data/Personas.csv             Personas und ihre Merkmale
data/freigaben.json           Beispieldaten
data/phishing_vorlagen.json   Phishing-Nachricht je Merkmal
data/Persona_Bilder/          Bilder der Personas
assets/images/                Beispielfotos der Datensammelpässe
```
