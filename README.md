# Cookiemaster

Ein Unterrichtsspiel zu Datensparsamkeit und Phishing.

Jedes Kind spielt einen Tag lang eine **Persona**. Jede Persona gibt es zweimal, als grüne und als orange
Version. So können zwei Kinder dieselbe Figur spielen. Im Lauf des Tages werden die Kinder immer wieder
gefragt, ob sie eine Information über ihre Persona teilen wollen (Lieblingsspiel, Sport, Schule …).
Sagt ein Kind ja, kreuzt die Lehrperson das im **Datensammelpass** der passenden Farbe an.

Am Ende des Tages fotografiert die Lehrperson die beiden Pässe, und die App wertet sie automatisch aus.
Sie zeigt dann, wie viele Phishing-Nachrichten jede Persona aufgrund der geteilten Informationen bekommen
könnte. Die Nachrichten landen im Postfach eines simulierten Messengers – mit Chatübersicht und einem
Chat pro Absender –, und die Warnzeichen lassen sich gemeinsam besprechen.

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
4. In der Übersicht auf **Datensammelpässe hochladen** klicken. Auf der Upload-Seite beim **grünen** und
   beim **orangen Datensammelpass** jeweils das Foto auswählen und auf **Laden** klicken. Beim ersten Mal
   wird die Bilderkennung geladen (ca. 10 MB), danach dauert die Auswertung einige Sekunden.
5. **Auflösung:** Zurück zur Übersicht. Die Phishing-Zähler laufen einmal hoch, und die Personas sortieren
   sich danach, wie viel sie geteilt haben. Tipp: Die Übersicht kann auch in einem zweiten Tab offen sein
   (z. B. am Beamer) – sie aktualisiert sich nach dem Upload automatisch. Der Nachrichtenton erklingt erst,
   nachdem einmal in die Übersicht geklickt wurde.
6. Eine Persona anklicken und das **Postfach** öffnen. Es erscheint eine Chatübersicht mit einem Chat pro
   Absender. Ein Klick auf einen Chat zeigt die Phishing-Nachricht, ein Klick auf den Link darin die
   Warnzeichen.

Auf der Upload-Seite zeigt **Erkannte Kreuze prüfen**, was die App auf den Fotos erkannt hat. Unsichere
Kreuze sind mit **?** markiert und zählen als *nicht freigegeben*. Ist etwas falsch erkannt, hilft meist
ein neues, geraderes Foto.

Solange keine Pässe hochgeladen wurden, sind bei allen Personas **keine Merkmale freigegeben** – alle
Zähler stehen auf 0. Das Ergebnis eines Uploads bleibt im Browser gespeichert, bis neue Pässe geladen
werden. **Reset** in der Übersicht löscht die gespeicherten Pässe wieder, z. B. für die nächste Klasse.

Im Postfach gelten geöffnete Chats als gelesen. Das merkt sich der Browser nur, bis das Fenster
geschlossen wird.

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
- `generate_freigaben.py` – dieselbe Erkennung in Python, nur zur Fehlersuche. Mit `--debug` lässt sich
  die Erkennung untersuchen. Die App selbst braucht das Skript nicht.

Wer Schwellenwerte oder den Ablauf ändert, muss das in **beiden** Dateien tun.

```bash
python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

python generate_freigaben.py           # Fotos aus assets/images/ auswerten
python generate_freigaben.py --debug   # zusätzlich data/debug_grün.jpg und data/debug_orange.jpg
```

Das Skript gibt die erkannte Matrix in der Konsole aus und schreibt sie nach `data/freigaben.json`. Die
Debug-Bilder zeigen das erkannte Raster und den Tintenanteil pro Zelle. Beide Ausgaben werden von Git
ignoriert.

Hochgeladene Pässe speichert die App im `localStorage` unter `cookiemaster.freigaben`. Die Gelesen-Markierung
der Chats liegt im `sessionStorage` unter `cookiemaster.readChats.<persona>`.

### Projektstruktur

```
index.html                    Weiterleitung auf html/index.html (für GitHub Pages)
html/index.html               Übersicht der Personas (Phishing-Zähler, Filter, Reset)
html/upload.html              Upload und Auswertung der Datensammelpässe
html/detail.html              Detailseite einer Persona mit Postfach
script.js                     App-Logik (Daten laden, prüfen, anzeigen, Postfach-Navigation)
pass-scanner.js               Bilderkennung im Browser
vendor/opencv.js              OpenCV für den Browser (Apache 2.0)
chat.js, chat.css             Messenger-Komponente (Chatübersicht und Chat)
styles.css                    Allgemeines Layout
start.bat                     Lokaler Start unter Windows
generate_freigaben.py         Bilderkennung in Python (nur Fehlersuche)
requirements.txt              Python-Pakete für generate_freigaben.py
data/Personas.csv             Personas und ihre Merkmale
data/phishing_vorlagen.json   Phishing-Nachricht je Merkmal
data/Persona_Bilder/          Bilder der Personas
assets/images/                Beispielfotos der Datensammelpässe (zum Ausprobieren des Uploads)
```
