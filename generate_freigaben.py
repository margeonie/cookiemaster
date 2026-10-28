#!/usr/bin/env python3
"""Generate freigaben.json from a scanned datensammelpass JPEG.

Usage:
    python generate_freigaben.py --csv personas.csv --image datensammelpass.jpeg --output freigaben.json
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


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


def find_border_positions(values: np.ndarray, threshold: int) -> list[int]:
    active = np.where(values > threshold)[0]
    if active.size == 0:
        return []

    runs: list[tuple[int, int]] = []
    start = int(active[0])
    prev = int(active[0])

    for idx in active[1:]:
        current = int(idx)
        if current == prev + 1:
            prev = current
            continue
        runs.append((start, prev))
        start = current
        prev = current

    runs.append((start, prev))
    return [run[0] for run in runs]


def detect_table_bounds(img: Image.Image, dark_threshold: int = 200) -> tuple[int, int, int, int]:
    arr = np.asarray(img.convert("L"))
    mask = arr < dark_threshold
    ys, xs = np.where(mask)
    if xs.size == 0 or ys.size == 0:
        raise ValueError("No dark pixels found in the image. Is this a valid datensammelpass image?")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def detect_mark_in_cell(cell: Image.Image) -> tuple[bool, bool]:
    arr = np.asarray(cell.convert("L"))
    if arr.size == 0:
        return False, False

    h, w = arr.shape
    if h < 4 or w < 4:
        return False, False

    dark = arr < 200
    dark_ratio = float(dark.mean())
    if dark_ratio < 0.02:
        return False, False

    yy, xx = np.indices((h, w))
    cy, cx = h / 2.0, w / 2.0
    diag1 = np.abs((yy - cy) - (xx - cx)) < max(3, min(h, w) * 0.16)
    diag2 = np.abs((yy - cy) + (xx - cx)) < max(3, min(h, w) * 0.16)
    cross_pixels = (dark & (diag1 | diag2)).sum()
    cross_ratio = float(cross_pixels / max(1, dark.sum()))

    marked = dark_ratio > 0.08 and cross_ratio > 0.15
    uncertain = dark_ratio > 0.04 and dark_ratio <= 0.08 and cross_ratio > 0.10
    return marked, uncertain


def build_matrix_preview(person_names: list[str], feature_names: list[str], rows_data: list[dict[str, str]]) -> list[list[str]]:
    matrix = []
    for person_name in person_names:
        values = []
        row = next((r for r in rows_data if normalize_person_name(r.get("Name", "")) == normalize_person_name(person_name)), None)
        if row is None:
            raise ValueError(f"Persona not found in CSV: {person_name}")
        for feature in feature_names:
            values.append("X" if row.get(feature, "").strip() == "X" else "")
        matrix.append([person_name, *values])
    return matrix


def parse_pass_image(image_path: Path, csv_fieldnames: list[str], rows: list[dict[str, str]], output_path: Path | None = None):
    img = Image.open(image_path).convert("RGB")
    gray = ImageOps.grayscale(img)
    table_left, table_top, table_right, table_bottom = detect_table_bounds(gray)

    feature_names = [name.strip() for name in csv_fieldnames[1:]]
    person_names = [str(row.get(csv_fieldnames[0], "")).strip() for row in rows]

    table = np.asarray(gray)
    col_values = table.sum(axis=0)
    row_values = table.sum(axis=1)
    x_boundaries = find_border_positions(col_values, threshold=500)
    y_boundaries = find_border_positions(row_values, threshold=500)

    if len(x_boundaries) < len(feature_names) + 2:
        x_boundaries = list(range(table_left, table_right + 1, max(1, (table_right - table_left) // (len(feature_names) + 2))))
    if len(y_boundaries) < len(person_names) + 2:
        y_boundaries = list(range(table_top, table_bottom + 1, max(1, (table_bottom - table_top) // (len(person_names) + 2))))

    matrix = [[""] * (len(feature_names) + 1) for _ in range(len(person_names) + 1)]
    matrix[0][0] = "Persona"
    for idx, feature in enumerate(feature_names):
        matrix[0][idx + 1] = feature
    for person_idx, person_name in enumerate(person_names):
        matrix[person_idx + 1][0] = person_name

    all_cells = []
    for person_idx in range(len(person_names)):
        for feature_idx in range(len(feature_names)):
            left = int(x_boundaries[feature_idx + 1] + 2)
            right = int(x_boundaries[feature_idx + 2] - 2)
            top = int(y_boundaries[person_idx + 1] + 2)
            bottom = int(y_boundaries[person_idx + 2] - 2)

            if right <= left or bottom <= top:
                continue

            crop = gray.crop((max(0, left), max(0, top), min(gray.width, right), min(gray.height, bottom)))
            marked, uncertain = detect_mark_in_cell(crop)
            feature = feature_names[feature_idx]
            person = person_names[person_idx]
            value = "X" if marked else ""
            if uncertain:
                value = "!"
            matrix[person_idx + 1][feature_idx + 1] = value
            all_cells.append({
                "persona": person,
                "feature": feature,
                "marked": marked,
                "uncertain": uncertain,
                "value": value,
            })

    json_result = {"merkmale": feature_names, "personas": {}}
    for person_name in person_names:
        json_result["personas"][person_name] = {}
        for feature in feature_names:
            cell_value = next(
                (entry["value"] for entry in all_cells if entry["persona"] == person_name and entry["feature"] == feature),
                "",
            )
            json_result["personas"][person_name][feature] = cell_value == "X"

    if output_path is not None:
        output_path.write_text(json.dumps(json_result, ensure_ascii=False, indent=2), encoding="utf-8")

    return matrix, json_result


def print_matrix(matrix: list[list[str]]) -> None:
    widths = [max(len(str(row[idx])) for row in [header for header in matrix]) for idx in range(len(matrix[0]))]
    for row in matrix:
        print(" | ".join(str(cell).ljust(widths[idx]) for idx, cell in enumerate(row)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate freigaben.json from a datensammelpass JPEG")
    parser.add_argument("--csv", required=True, type=Path, help="Path to personas.csv")
    parser.add_argument("--image", required=True, type=Path, help="Path to the datensammelpass.jpeg")
    parser.add_argument("--output", default=Path("freigaben.json"), type=Path, help="Output JSON file path")
    args = parser.parse_args()

    try:
        fieldnames, rows = read_csv_matrix(args.csv)
        matrix, json_result = parse_pass_image(args.image, fieldnames, rows, args.output)

        print("Erkannte Matrix (X = öffentlich):")
        print_matrix(matrix)
        print()
        print(f"Saved: {args.output}")
        return 0
    except Exception as exc:  # pragma: no cover
        print(f"Fehler: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
