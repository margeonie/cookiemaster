// Tests für review-state.js.
// Im Browser: tests/review.test.html öffnen (über start.bat bzw. python -m http.server).
// Mit Node (optional): node --test tests/
const inNode = typeof window === 'undefined';
const FreigabeReview = inNode ? require('../review-state.js') : window.FreigabeReview;
const test = inNode ? require('node:test') : window.browserTest;
const assert = inNode ? require('node:assert/strict') : window.browserAssert;

const FEATURES = ['Lieblingsspiel', 'Sport', 'Schule'];

// Erkennungsergebnis wie von PassScanner.scanPasses() (nur die benötigten Felder)
function scanResults() {
  return {
    Grün: {
      matrix: [
        ['Persona', ...FEATURES],
        ['Alex', 'X', '!', ''],
        ['Bente', '-', '-', '-'],
        ['Kim', '', 'X', 'X']
      ],
      struck: ['Bente']
    },
    Orange: {
      matrix: [
        ['Persona', ...FEATURES],
        ['Alex', '', '', 'X']
      ],
      struck: []
    }
  };
}

function finalOf(review, color, person, feature) {
  const entry = review.passes.find((pass) => pass.color === color).persons.find((p) => p.name === person);
  return entry.cells.find((cell) => cell.feature === feature).final;
}

test('Startwert jeder Zelle ist das Erkennungsergebnis, ? startet als aus', () => {
  const review = FreigabeReview.createReview(scanResults(), FEATURES);
  assert.equal(finalOf(review, 'Grün', 'Alex', 'Lieblingsspiel'), true);
  assert.equal(finalOf(review, 'Grün', 'Alex', 'Sport'), false); // '!' = unsicher
  assert.equal(finalOf(review, 'Grün', 'Alex', 'Schule'), false);
  assert.equal(finalOf(review, 'Grün', 'Kim', 'Schule'), true);
  assert.equal(FreigabeReview.countChanges(review), 0);
});

test('Gestrichene Personas haben keine Toggles', () => {
  const review = FreigabeReview.createReview(scanResults(), FEATURES);
  const bente = review.passes[0].persons.find((p) => p.name === 'Bente');
  assert.equal(bente.struck, true);
  assert.deepEqual(bente.cells, []);
  assert.throws(() => FreigabeReview.toggleCell(review, 'Grün', 'Bente', 'Sport'));
});

test('Toggle schaltet an und wieder aus und betrifft nur die eine Zelle', () => {
  const review = FreigabeReview.createReview(scanResults(), FEATURES);
  assert.equal(FreigabeReview.toggleCell(review, 'Grün', 'Alex', 'Sport'), true);
  assert.equal(finalOf(review, 'Grün', 'Alex', 'Sport'), true);
  assert.equal(finalOf(review, 'Orange', 'Alex', 'Sport'), false); // gleiche Persona, andere Farbe
  assert.equal(FreigabeReview.countChanges(review), 1);

  assert.equal(FreigabeReview.toggleCell(review, 'Grün', 'Alex', 'Sport'), false);
  assert.equal(FreigabeReview.countChanges(review), 0);

  assert.equal(FreigabeReview.toggleCell(review, 'Grün', 'Alex', 'Lieblingsspiel'), false);
  assert.equal(FreigabeReview.countChanges(review), 1);
});

test('Toggle auf unbekannte Zelle wirft einen Fehler', () => {
  const review = FreigabeReview.createReview(scanResults(), FEATURES);
  assert.throws(() => FreigabeReview.toggleCell(review, 'Blau', 'Alex', 'Sport'));
  assert.throws(() => FreigabeReview.toggleCell(review, 'Grün', 'Niemand', 'Sport'));
  assert.throws(() => FreigabeReview.toggleCell(review, 'Grün', 'Alex', 'Haustier'));
});

test('Reset stellt das Erkennungsergebnis wieder her', () => {
  const review = FreigabeReview.createReview(scanResults(), FEATURES);
  FreigabeReview.toggleCell(review, 'Grün', 'Alex', 'Lieblingsspiel');
  FreigabeReview.toggleCell(review, 'Grün', 'Kim', 'Lieblingsspiel');
  FreigabeReview.toggleCell(review, 'Orange', 'Alex', 'Schule');
  assert.equal(FreigabeReview.countChanges(review), 3);

  FreigabeReview.resetReview(review);
  assert.equal(FreigabeReview.countChanges(review), 0);
  assert.equal(finalOf(review, 'Grün', 'Alex', 'Lieblingsspiel'), true);
  assert.equal(finalOf(review, 'Grün', 'Kim', 'Lieblingsspiel'), false);
  assert.equal(finalOf(review, 'Orange', 'Alex', 'Schule'), true);
});

test('Ohne Änderungen entspricht das Ergebnis der Erkennung (bisheriges Format)', () => {
  const review = FreigabeReview.createReview(scanResults(), FEATURES);
  assert.deepEqual(FreigabeReview.buildFinalData(review), {
    merkmale: FEATURES,
    personas: {
      Grün: {
        Alex: { Lieblingsspiel: true, Sport: false, Schule: false },
        Kim: { Lieblingsspiel: false, Sport: true, Schule: true }
      },
      Orange: {
        Alex: { Lieblingsspiel: false, Sport: false, Schule: true }
      }
    },
    ausgeschlossen: { Grün: ['Bente'], Orange: [] }
  });
});

test('Finale Daten enthalten nur die final-Werte, nicht die Erkennung', () => {
  const review = FreigabeReview.createReview(scanResults(), FEATURES);
  FreigabeReview.toggleCell(review, 'Grün', 'Alex', 'Lieblingsspiel'); // X -> aus
  FreigabeReview.toggleCell(review, 'Grün', 'Alex', 'Sport');          // ? -> an
  const data = FreigabeReview.buildFinalData(review);
  assert.deepEqual(data.personas.Grün.Alex, { Lieblingsspiel: false, Sport: true, Schule: false });
  // Nur boolesche Werte, keine Zwischendaten (scan/detected)
  Object.values(data.personas).forEach((personas) => Object.values(personas).forEach((flags) => {
    assert.deepEqual(Object.keys(flags), FEATURES);
    Object.values(flags).forEach((value) => assert.equal(typeof value, 'boolean'));
  }));
});

test('Finale Daten sind eine Kopie – spätere Toggles ändern sie nicht', () => {
  const review = FreigabeReview.createReview(scanResults(), FEATURES);
  const data = FreigabeReview.buildFinalData(review);
  FreigabeReview.toggleCell(review, 'Grün', 'Kim', 'Sport');
  assert.equal(data.personas.Grün.Kim.Sport, true);
});

test('Folgeprozess läuft nicht bei Erkennung, Toggle oder Reset', () => {
  const calls = [];
  const session = FreigabeReview.createReviewSession(scanResults(), FEATURES, (data) => { calls.push(data); });
  session.toggle('Grün', 'Alex', 'Sport');
  session.toggle('Orange', 'Alex', 'Schule');
  session.reset();
  session.toggle('Grün', 'Kim', 'Sport');
  assert.equal(calls.length, 0);
  assert.equal(session.isReleased(), false);
});

test('„Daten freigeben“ startet den Folgeprozess genau einmal mit den final-Werten', () => {
  const calls = [];
  const session = FreigabeReview.createReviewSession(scanResults(), FEATURES, (data) => {
    calls.push(data);
    return true;
  });
  session.toggle('Grün', 'Alex', 'Sport');
  session.toggle('Grün', 'Kim', 'Schule');
  assert.equal(session.release(), true);

  assert.equal(calls.length, 1);
  assert.equal(session.isReleased(), true);
  assert.deepEqual(calls[0].personas.Grün.Alex, { Lieblingsspiel: true, Sport: true, Schule: false });
  assert.deepEqual(calls[0].personas.Grün.Kim, { Lieblingsspiel: false, Sport: true, Schule: false });
  assert.deepEqual(calls[0].ausgeschlossen.Grün, ['Bente']);
});

test('Änderung nach der Freigabe macht den Stand wieder offen', () => {
  const calls = [];
  const session = FreigabeReview.createReviewSession(scanResults(), FEATURES, (data) => { calls.push(data); });
  session.release();
  assert.equal(session.isReleased(), true);

  session.toggle('Grün', 'Kim', 'Sport');
  assert.equal(session.isReleased(), false);
  session.release();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].personas.Grün.Kim.Sport, false);

  session.reset();
  assert.equal(session.isReleased(), false);
});

test('Schlägt der Folgeprozess fehl (false), gilt der Stand als nicht freigegeben', () => {
  const session = FreigabeReview.createReviewSession(scanResults(), FEATURES, () => false);
  assert.equal(session.release(), false);
  assert.equal(session.isReleased(), false);
});
