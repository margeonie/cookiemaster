#!/usr/bin/env python3
"""Generate freigaben.json from two scanned datensammelpass JPEGs (Grün + Orange).

Usage:
    python generate_freigaben.py            # normal
    python generate_freigaben.py --debug    # zusätzlich Kontrollbilder speichern

Benötigt: pip install -r requirements.txt

Defaults:
    CSV:    data/Personas.csv
    Images: assets/images/datensammelpass_gruen.jpeg
            assets/images/datensammelpass_orange.jpeg
    Output: data/freigaben.json

Output structure:
    {
      "merkmale": [...],
      "personas": {
        "Grün":   {"Jules": {"Lieblingsvideospiel": true, ...}, ...},
        "Orange": {"Jules": {...}, ...}
      },
      "ausgeschlossen": {
        "Grün":   [],
        "Orange": ["Robin", "Joni"]
      }
    }

Ist ein Name im Pass durchgestrichen/übermalt, spielt diese Persona nicht mit:
sie fehlt unter "personas" und steht stattdessen unter "ausgeschlossen".

Die Web-App wertet die Pässe mit pass-scanner.js direkt im Browser aus – das
ist eine 1:1-Übertragung dieses Skripts. Schwellenwerte und Ablauf müssen in
beiden Dateien gleich bleiben. Dieses Skript ist vor allem zur Fehlersuche
(--debug) und zum Erzeugen der Beispieldaten in data/freigaben.json da.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import unicodedata
from pathlib import Path

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d

PROJECT_DIR = Path(__file__).resolve().parent

# Spalten der Personas.csv, die keine Merkmale sind
NON_FEATURE_COLUMNS = {"farbe", "name", "bilddatei"}


def normalize_feature_name(value: str) -> str:
    text = (value or "").strip().replace("\ufeff", "").lower()
    text = text.rstrip("?")
    text = text.rstrip().rstrip(":")
    text = text.replace("*", "")
    text = " ".join(text.split())
    if "lieblingsmusiker" in text and text.endswith("in"):
        return "lieblingsmusiker:in"
    return text


def normalize_person_name(value: str) -> str:
    return " ".join((value or "").strip().replace("\ufeff", "").split()).lower()


def normalize_color(value: str) -> str:
    # NFC, damit "ü" aus macOS-Dateinamen/CSV-Exporten gleich behandelt wird
    return unicodedata.normalize("NFC", normalize_person_name(value))


def read_csv_matrix(csv_path: Path):
    with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
        sample = fh.read(4096)
        fh.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
        reader = csv.DictReader(fh, dialect=dialect)
        if reader.fieldnames is None:
            raise ValueError(f"CSV could not be parsed: {csv_path}")

        fieldnames = [name.strip() for name in reader.fieldnames]
        rows = []
        for row in reader:
            cleaned = {key.strip(): (value.strip() if value is not None else "") for key, value in row.items()}
            rows.append(cleaned)

        if not rows:
            raise ValueError(f"CSV contains no data rows: {csv_path}")

        return fieldnames, rows


# ---------------------------------------------------------------------------
# Kreuz-Einleselogik für Handyfotos
#
# Annahmen (gelten für beide Pässe gleich):
#   - Tabelle mit (Merkmale + 1) Spalten und (Personas + 1) Zeilen, also 6 x 16
#   - oberste Zeile = Merkmalsnamen, linke Spalte = Personanamen
#   - Zellen sind farbig hinterlegt, dazwischen weiße Zwischenräume
#   - ein Kreuz ist dunkle Tinte innerhalb einer Zelle
#
# Ablauf:
#   1. Papier vom (farbigen) Holztisch trennen und perspektivisch gerade ziehen
#   2. Zeilen- und Spaltengrenzen über die weißen Zwischenräume finden
#      (die bekannte Anzahl an Zeilen/Spalten macht das robust)
#   3. Pro Zelle den Anteil dunkler Tinte messen (reine Helligkeit, also
#      unabhängig davon, ob der Pass grün oder orange ist)
# ---------------------------------------------------------------------------

WARP_WIDTH, WARP_HEIGHT = 1400, 2000
INK_DARKER_THAN_CELL = 45     # so viel dunkler als der Zellhintergrund = Tinte
MARK_THRESHOLD = 0.005        # >= 0,5 % Tinte in der Zelle = Kreuz
UNCERTAIN_THRESHOLD = 0.002   # 0,2-0,5 % = unsicher

# Durchgestrichene Namen: In der Personaspalte steht immer der gedruckte Name
# (ca. 1-2,5 % sehr dunkle Pixel). Eine Kritzelei darüber erhöht das deutlich
# (ca. 5-7 %). Gemessen wird nur sehr dunkle Tinte.
NAME_INK_DARKER_THAN_CELL = 80
STRUCK_THRESHOLD = 0.04       # >= 4 % = Name durchgestrichen -> Persona spielt nicht mit
STRUCK_UNCERTAIN = 0.03       # 3-4 % = unsicher (Persona wird trotzdem berücksichtigt)


def _chroma(bgr: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    return np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)


def _fit_line(along: np.ndarray, across: np.ndarray) -> tuple[float, float]:
    """Robuste Geradenanpassung across = m * along + c (Ausreißer werden verworfen)."""
    keep = np.ones(len(along), bool)
    for _ in range(3):
        m, c = np.polyfit(along[keep], across[keep], 1)
        resid = np.abs(across - (m * along + c))
        keep = resid < max(5.0, 2.5 * float(np.median(resid[keep])))
    return float(m), float(c)


def find_paper_corners(bgr: np.ndarray) -> np.ndarray:
    """Bestimmt vier Punkte (oben links, oben rechts, unten rechts, unten links) des Blatts.

    Verwendet werden nur die obere Kante sowie der obere Teil der linken und
    rechten Kante. Die sind auf Fotos zuverlässig sichtbar; unten ragt das
    Blatt oft aus dem Bild oder liegt im Schatten.
    """
    height, width = bgr.shape[:2]
    # Papier ist heller und weniger gelblich als der Holztisch
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    score = cv2.GaussianBlur(lab[..., 0] - 3 * (lab[..., 2] - 128), (0, 0), 3)
    s8 = cv2.normalize(score, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    _, paper = cv2.threshold(s8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    paper = cv2.morphologyEx(paper, cv2.MORPH_OPEN, np.ones((15, 15), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(paper)
    if n < 2:
        raise ValueError("Kein Blatt im Foto gefunden.")
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    mask = labels == biggest
    x0, y0, bw, bh = stats[biggest, :4]

    # Obere Kante: oberster Papierpixel je Spalte (mittlere 70 %)
    cols = np.arange(x0 + int(0.15 * bw), x0 + int(0.85 * bw), 4)
    tops = np.array([np.argmax(mask[:, x]) for x in cols], float)
    m_top, c_top = _fit_line(cols.astype(float), tops)

    # Linke/rechte Kante: äußerster Papierpixel je Zeile (oberer Bereich)
    rows = np.arange(y0 + int(0.05 * bh), y0 + int(0.55 * bh), 4)
    lefts = np.array([np.argmax(mask[y]) for y in rows], float)
    rights = np.array([width - 1 - np.argmax(mask[y, ::-1]) for y in rows], float)
    m_left, c_left = _fit_line(rows.astype(float), lefts)
    m_right, c_right = _fit_line(rows.astype(float), rights)

    def on_top(m_side, c_side):  # Schnittpunkt Seitenkante x=m*y+c mit oberer Kante y=m*x+c
        y = (m_top * c_side + c_top) / (1 - m_top * m_side)
        return m_side * y + c_side, y

    tl, tr = on_top(m_left, c_left), on_top(m_right, c_right)
    # Untere Hilfskante: parallel zur oberen Kante, nahe am unteren Bildrand
    shift = 0.95 * height - (m_top * width / 2 + c_top)
    def on_bottom(m_side, c_side):
        y = (m_top * c_side + c_top + shift) / (1 - m_top * m_side)
        return m_side * y + c_side, y

    br, bl = on_bottom(m_right, c_right), on_bottom(m_left, c_left)
    return np.array([tl, tr, br, bl], np.float32)


def straighten(bgr: np.ndarray, corners: np.ndarray) -> np.ndarray:
    target = np.float32([[0, 0], [WARP_WIDTH, 0], [WARP_WIDTH, WARP_HEIGHT], [0, WARP_HEIGHT]])
    matrix = cv2.getPerspectiveTransform(corners, target)
    return cv2.warpPerspective(bgr, matrix, (WARP_WIDTH, WARP_HEIGHT))


def fit_grid_lines(profile: np.ndarray, bands: int, min_size: float, max_size: float) -> list[int]:
    """Legt ein Raster aus `bands` gleich großen Bändern über das Profil.

    Gesucht werden Start, Bandbreite und eine leichte Zu-/Abnahme der Bandbreite
    (Restperspektive), sodass die Grenzen auf hellen Zwischenräumen und die
    Bandmitten auf dunkleren Zellen liegen. Weil alle Bänder gemeinsam passen
    müssen, stören einzelne Kreuze oder Kritzeleien kaum.
    """
    p = gaussian_filter1d(profile.astype(float), 2)
    n = len(p)
    k = np.arange(bands + 1, dtype=float)
    centers_k = k[:-1] + 0.5
    best_score, best = -np.inf, None

    def score(start, size, growth):
        bounds = start + size * k + growth * k * k
        centers = start + size * centers_k + growth * centers_k * centers_k
        # Die letzte Spalte darf etwas aus dem Bild ragen (abgeschnittenes Foto)
        if bounds[0] < 0 or centers[-1] >= n:
            return -np.inf
        idx = lambda v: np.clip(np.round(v).astype(int), 0, n - 1)
        gap_vals = p[idx(bounds[1:-1])]
        cell_vals = p[idx(centers)]
        edge_vals = p[idx(bounds[[0, -1]])]
        return cell_vals.mean() - 0.7 * gap_vals.mean() - 0.3 * edge_vals.mean()

    for size in np.arange(min_size, max_size, 2.0):
        for start in range(0, max(1, int(n - size * (bands - 0.5))), 4):
            for growth in np.linspace(-0.6, 0.6, 7):
                sc = score(start, size, growth)
                if sc > best_score:
                    best_score, best = sc, (start, size, growth)
    if best is None:
        raise ValueError("Raster konnte nicht eingepasst werden.")
    # Feinabstimmung
    start0, size0, growth0 = best
    for size in np.arange(size0 - 2, size0 + 2.01, 0.25):
        for start in np.arange(start0 - 4, start0 + 4.01, 0.5):
            for growth in np.linspace(growth0 - 0.1, growth0 + 0.1, 11):
                sc = score(start, size, growth)
                if sc > best_score:
                    best_score, best = sc, (start, size, growth)
    start, size, growth = best
    return [int(min(n, max(0, round(start + size * i + growth * i * i)))) for i in range(bands + 1)]


def detect_grid(straight: np.ndarray, rows: int, cols: int) -> tuple[list[int], list[int]]:
    """Liefert die Zeilen- und Spaltengrenzen (rows+1 bzw. cols+1 Werte)."""
    lightness = cv2.cvtColor(straight, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
    local_white = cv2.GaussianBlur(cv2.dilate(lightness, np.ones((151, 151), np.uint8)), (0, 0), 30)
    # Zellen sind dunkler als die weißen Zwischenräume (unabhängig vom Farbstich des Fotos);
    # Kappen, damit Tinte und dunkle Kopfzeile das Profil nicht dominieren
    darkness = np.clip(local_white - lightness, 0, 25)

    height, width = darkness.shape
    xs = fit_grid_lines(darkness.mean(axis=0), cols, width / (cols + 1.5), width / cols + 1)
    # Für die Zeilen nur den Tabellenbereich (ohne Personaspalte) betrachten
    ys = fit_grid_lines(darkness[:, xs[1]:xs[-1]].mean(axis=1), rows, height / (rows + 8), height / rows + 1)
    return ys, xs


def ink_ratio(straight: np.ndarray, top: int, bottom: int, left: int, right: int,
              inset: float = 0.12, darker_than: float = INK_DARKER_THAN_CELL) -> float:
    """Anteil schwarzer Tinte in einer Zelle.

    Der Rand der Zelle wird links/rechts um `inset` gekürzt, damit Papierkante
    oder Tisch bei angeschnittenen Spalten nicht als Tinte zählen.
    """
    margin = int((right - left) * inset)
    cell = straight[top:bottom, left + margin:right - margin]
    if cell.size == 0:
        return 0.0
    lab = cv2.cvtColor(cell, cv2.COLOR_BGR2LAB).astype(np.float32)
    lightness = lab[..., 0]
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    # Tinte = deutlich dunkler als der Zellhintergrund und (anders als Holz) kaum farbig
    ink = (lightness < np.median(lightness) - darker_than) & (chroma < 25)
    return float(ink.mean())


def parse_pass_image(image_path: Path, person_names: list[str], feature_names: list[str], debug_path: Path | None = None):
    """Liest einen Datensammelpass ein.

    Rückgabe: (Matrix für die Konsole, Freigaben der mitspielenden Personas,
               Liste der durchgestrichenen Personas, Liste unsicherer Namen)
    """
    bgr = cv2.imread(str(image_path))
    if bgr is None:
        raise ValueError(f"Bild konnte nicht gelesen werden: {image_path}")

    straight = straighten(bgr, find_paper_corners(bgr))
    ys, xs = detect_grid(straight, rows=len(person_names) + 1, cols=len(feature_names) + 1)

    matrix = [["Persona", *feature_names]]
    freigaben: dict[str, dict[str, bool]] = {}
    struck: list[str] = []
    struck_uncertain: list[str] = []
    debug = straight.copy() if debug_path else None

    for p_idx, person in enumerate(person_names):
        top, bottom = ys[p_idx + 1], ys[p_idx + 2]

        # 1) Ist der Name durchgestrichen?
        name_ratio = ink_ratio(straight, top, bottom, xs[0], xs[1], inset=0.05,
                               darker_than=NAME_INK_DARKER_THAN_CELL)
        is_struck = name_ratio >= STRUCK_THRESHOLD
        if not is_struck and name_ratio >= STRUCK_UNCERTAIN:
            struck_uncertain.append(person)
        if debug is not None:
            color = (0, 0, 255) if is_struck else (0, 165, 255) if person in struck_uncertain else (255, 0, 0)
            cv2.rectangle(debug, (xs[0] + 3, top + 3), (xs[1] - 3, bottom - 3), color, 4)
            cv2.putText(debug, f"{name_ratio * 100:.1f}%", (xs[0] + 8, bottom - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        if is_struck:
            struck.append(person)
            matrix.append([f"{person} (gestrichen)", *["-"] * len(feature_names)])
            continue

        # 2) Merkmale auslesen
        row = [person]
        freigaben[person] = {}
        for f_idx, feature in enumerate(feature_names):
            left, right = xs[f_idx + 1], xs[f_idx + 2]
            ratio = ink_ratio(straight, top, bottom, left, right)
            value = "X" if ratio >= MARK_THRESHOLD else "!" if ratio >= UNCERTAIN_THRESHOLD else ""
            row.append(value)
            freigaben[person][feature] = value == "X"
            if debug is not None:
                color = {"X": (0, 180, 0), "!": (0, 165, 255), "": (180, 180, 180)}[value]
                cv2.rectangle(debug, (left + 3, top + 3), (right - 3, bottom - 3), color, 4)
                cv2.putText(debug, f"{ratio * 100:.1f}%", (left + 8, bottom - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        matrix.append(row)

    if debug is not None:
        debug_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(debug_path), debug)

    return matrix, freigaben, struck, struck_uncertain


# ---------------------------------------------------------------------------
# Neu: zwei Pässe, Zuordnung über die Spalte "Farbe"
# ---------------------------------------------------------------------------

def resolve_image_path(path: Path) -> Path:
    """Findet die Datei auch bei abweichender Groß-/Kleinschreibung (.jpeg/.JPEG)
    oder unterschiedlicher Unicode-Schreibweise von "ü"."""
    if path.is_file():
        return path
    if path.parent.is_dir():
        wanted = unicodedata.normalize("NFC", path.name).lower()
        for candidate in path.parent.iterdir():
            if unicodedata.normalize("NFC", candidate.name).lower() == wanted:
                return candidate
    raise FileNotFoundError(f"Datensammelpass nicht gefunden: {path}")


def find_column(fieldnames: list[str], wanted: str) -> str:
    for name in fieldnames:
        if normalize_feature_name(name) == wanted:
            return name
    raise ValueError(f"CSV-Spalte '{wanted}' fehlt. Gefunden: {', '.join(fieldnames)}")


def print_matrix(matrix: list[list[str]]) -> None:
    widths = [max(len(str(row[idx])) for row in matrix) for idx in range(len(matrix[0]))]
    for row in matrix:
        print(" | ".join(str(cell).ljust(widths[idx]) for idx, cell in enumerate(row)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate freigaben.json from two datensammelpass JPEGs")
    parser.add_argument(
        "--csv",
        default=PROJECT_DIR / "data" / "Personas.csv",
        type=Path,
        help="Path to Personas.csv (default: data/Personas.csv)",
    )
    parser.add_argument(
        "--image-gruen",
        default=PROJECT_DIR / "assets" / "images" / "datensammelpass_gruen.jpeg",
        type=Path,
        help="Grüner Pass (default: assets/images/datensammelpass_gruen.jpeg)",
    )
    parser.add_argument(
        "--image-orange",
        default=PROJECT_DIR / "assets" / "images" / "datensammelpass_orange.jpeg",
        type=Path,
        help="Oranger Pass (default: assets/images/datensammelpass_orange.jpeg)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Speichert pro Pass ein Kontrollbild (data/debug_<farbe>.jpg) mit erkanntem Raster",
    )
    parser.add_argument(
        "--output",
        default=PROJECT_DIR / "data" / "freigaben.json",
        type=Path,
        help="Output JSON file path (default: data/freigaben.json)",
    )
    args = parser.parse_args()

    try:
        fieldnames, rows = read_csv_matrix(args.csv)
        color_column = find_column(fieldnames, "farbe")
        name_column = find_column(fieldnames, "name")
        feature_names = [f for f in fieldnames if normalize_feature_name(f) not in NON_FEATURE_COLUMNS]

        passes = {"grün": args.image_gruen, "orange": args.image_orange}
        result = {"merkmale": feature_names, "personas": {}, "ausgeschlossen": {}}
        uncertain_cells = []

        for color_key, image_arg in passes.items():
            color_rows = [r for r in rows if normalize_color(r.get(color_column, "")) == color_key]
            if not color_rows:
                raise ValueError(f"Keine Zeilen mit Farbe '{color_key}' in der CSV gefunden.")
            color_label = color_rows[0][color_column]  # Schreibweise wie in der CSV, z. B. "Grün"
            person_names = [r[name_column] for r in color_rows]  # Reihenfolge wie in der CSV = wie im Pass

            image_path = resolve_image_path(image_arg)
            debug_path = args.output.parent / f"debug_{color_key}.jpg" if args.debug else None
            matrix, freigaben, struck, struck_uncertain = parse_pass_image(
                image_path, person_names, feature_names, debug_path)
            result["personas"][color_label] = freigaben
            result["ausgeschlossen"][color_label] = struck

            print(f"Erkannte Matrix {color_label} ({image_path.name}) — X = freigegeben, ! = unsicher:")
            print_matrix(matrix)
            print()

            if struck:
                print(f"Durchgestrichen, spielen nicht mit ({color_label}): {', '.join(struck)}")
                print()
            for person in struck_uncertain:
                uncertain_cells.append(f"{color_label} / {person} / Name evtl. durchgestrichen (wird berücksichtigt)")
            for row in matrix[1:]:
                for idx, value in enumerate(row[1:]):
                    if value == "!":
                        uncertain_cells.append(f"{color_label} / {row[0]} / {feature_names[idx]}")

        if uncertain_cells:
            print("Unsichere Zellen (als NICHT freigegeben gespeichert, bitte prüfen):")
            for cell in uncertain_cells:
                print(f"  - {cell}")
            print()

        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Saved: {args.output}")
        return 0
    except Exception as exc:  # pragma: no cover
        print(f"Fehler: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
