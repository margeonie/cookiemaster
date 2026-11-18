// Review der erkannten Kreuze, bevor sie freigegeben werden.
//
// Die Bilderkennung liefert nur einen Zwischenstand. Pro Zelle (Persona × Merkmal)
// wird gespeichert, was erkannt wurde (`detected`) und was nach dem Review gilt
// (`final`). Weitergegeben werden ausschließlich die `final`-Werte – und erst,
// wenn `release()` aufgerufen wird („Daten freigeben“).
//
// Reine Logik ohne DOM: läuft im Browser (window.FreigabeReview) und in Node
// (module.exports), damit sie sich ohne Seite testen lässt.
(function () {
  // results: { [farbe]: { matrix, struck } } wie von PassScanner.scanPasses().
  // Matrixwerte: 'X' = Kreuz, '!' = unsicher, '' = leer, '-' = Persona gestrichen.
  // Nur 'X' gilt als erkannt – unsichere Zellen starten als nicht freigegeben.
  function createReview(results, featureNames) {
    const merkmale = [...featureNames];
    const passes = Object.entries(results || {}).map(([color, result]) => {
      const struck = result.struck || [];
      const persons = (result.matrix || []).slice(1).map(([name, ...values]) => {
        const isStruck = struck.includes(name);
        return {
          name,
          struck: isStruck,
          cells: isStruck ? [] : merkmale.map((feature, index) => {
            const scan = values[index] ?? '';
            const detected = scan === 'X';
            return { feature, scan, detected, final: detected };
          })
        };
      });
      return { color, persons };
    });
    return { merkmale, passes };
  }

  function findCell(review, color, person, feature) {
    const pass = review.passes.find((item) => item.color === color);
    const entry = pass?.persons.find((item) => item.name === person);
    const cell = entry?.cells.find((item) => item.feature === feature);
    if (!cell) throw new Error(`Keine Zelle für ${color} / ${person} / ${feature}.`);
    return cell;
  }

  function forEachCell(review, callback) {
    review.passes.forEach((pass) => pass.persons.forEach((person) => person.cells.forEach(callback)));
  }

  // Schaltet die Freigabe einer Zelle um und liefert den neuen Wert.
  function toggleCell(review, color, person, feature) {
    const cell = findCell(review, color, person, feature);
    cell.final = !cell.final;
    return cell.final;
  }

  // Alle Zellen zurück auf das Erkennungsergebnis.
  function resetReview(review) {
    forEachCell(review, (cell) => { cell.final = cell.detected; });
  }

  function countChanges(review) {
    let changes = 0;
    forEachCell(review, (cell) => { if (cell.final !== cell.detected) changes += 1; });
    return changes;
  }

  // Freigaben-Format { merkmale, personas, ausgeschlossen } – nur aus den final-Werten.
  // Liefert immer neue Objekte, spätere Änderungen am Review wirken sich nicht aus.
  function buildFinalData(review) {
    const data = { merkmale: [...review.merkmale], personas: {}, ausgeschlossen: {} };
    review.passes.forEach(({ color, persons }) => {
      data.personas[color] = {};
      data.ausgeschlossen[color] = [];
      persons.forEach((person) => {
        if (person.struck) {
          data.ausgeschlossen[color].push(person.name);
          return;
        }
        data.personas[color][person.name] = Object.fromEntries(
          person.cells.map((cell) => [cell.feature, cell.final])
        );
      });
    });
    return data;
  }

  // Ein Review-Durchgang. `onRelease(finalData)` ist der nachgelagerte Prozess und
  // läuft ausschließlich über release(). Gibt onRelease `false` zurück (z. B.
  // Speichern fehlgeschlagen), gilt der Stand weiter als nicht freigegeben.
  function createReviewSession(results, featureNames, onRelease) {
    const review = createReview(results, featureNames);
    let released = false;
    return {
      review,
      toggle(color, person, feature) {
        const value = toggleCell(review, color, person, feature);
        released = false;
        return value;
      },
      reset() {
        resetReview(review);
        released = false;
      },
      changeCount() {
        return countChanges(review);
      },
      isReleased() {
        return released;
      },
      release() {
        const outcome = onRelease(buildFinalData(review));
        released = outcome !== false;
        return outcome;
      }
    };
  }

  const api = { createReview, toggleCell, resetReview, countChanges, buildFinalData, createReviewSession };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FreigabeReview = api;
})();
