// Liest Kreuze aus Handyfotos der Datensammelpässe – direkt im Browser.
//
// Das ist eine 1:1-Übertragung von generate_freigaben.py nach JavaScript
// (OpenCV.js statt OpenCV für Python). Schwellenwerte und Ablauf müssen in
// beiden Dateien gleich bleiben.
//
// Ablauf:
//   1. Papier vom (farbigen) Holztisch trennen und perspektivisch gerade ziehen
//   2. Zeilen- und Spaltengrenzen über die weißen Zwischenräume finden
//   3. Pro Zelle den Anteil dunkler Tinte messen
(function () {
  const OPENCV_URL = new URL('vendor/opencv.js', document.currentScript.src).href;

  const WARP_WIDTH = 1400;
  const WARP_HEIGHT = 2000;
  const INK_DARKER_THAN_CELL = 45;   // so viel dunkler als der Zellhintergrund = Tinte
  const MARK_THRESHOLD = 0.005;      // >= 0,5 % Tinte in der Zelle = Kreuz
  const UNCERTAIN_THRESHOLD = 0.002; // 0,2-0,5 % = unsicher

  // Durchgestrichene Namen: gedruckter Name ca. 1-2,5 % sehr dunkle Pixel,
  // eine Kritzelei darüber deutlich mehr (ca. 5-7 %).
  const NAME_INK_DARKER_THAN_CELL = 80;
  const STRUCK_THRESHOLD = 0.04;     // >= 4 % = Name durchgestrichen -> Persona spielt nicht mit
  const STRUCK_UNCERTAIN = 0.03;     // 3-4 % = unsicher (Persona wird trotzdem berücksichtigt)

  let openCvPromise = null;

  // ---------------------------------------------------------------------------
  // OpenCV.js nachladen (ca. 10 MB, wird nur beim ersten Auswerten geladen)
  // ---------------------------------------------------------------------------

  function loadOpenCv() {
    if (openCvPromise) return openCvPromise;
    openCvPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = OPENCV_URL;
      script.async = true;
      script.onerror = () => reject(new Error('Die Bilderkennung (opencv.js) konnte nicht geladen werden.'));
      script.onload = async () => {
        try {
          let cv = window.cv;
          if (cv instanceof Promise) cv = await cv;
          if (!cv.Mat) {
            await new Promise((done) => { cv.onRuntimeInitialized = done; });
          }
          window.cv = cv;
          // Nicht resolve(cv): Das Modul hat eine eigene then()-Methode und würde
          // das Promise in eine Endlosschleife schicken.
          resolve({ cv });
        } catch (error) {
          reject(error);
        }
      };
      document.head.appendChild(script);
    });
    openCvPromise.catch(() => { openCvPromise = null; });
    return openCvPromise;
  }

  // ---------------------------------------------------------------------------
  // Kleine Helfer, die numpy/scipy exakt nachbilden
  // ---------------------------------------------------------------------------

  // np.round / Python round: bei .5 zur geraden Zahl runden
  function roundHalfEven(value) {
    const rounded = Math.round(value);
    if (Math.abs(value % 1) === 0.5) return 2 * Math.round(value / 2);
    return rounded;
  }

  function median(values) {
    const sorted = Float64Array.from(values).sort();
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function mean(values) {
    let sum = 0;
    for (const value of values) sum += value;
    return sum / values.length;
  }

  // np.arange(start, stop, step) – numpy rechnet ab dem dritten Wert mit
  // delta = (start + step) - start, nicht mit step selbst
  function arange(start, stop, step) {
    const count = Math.max(0, Math.ceil((stop - start) / step));
    const second = start + step;
    const delta = second - start;
    return Array.from({ length: count }, (_, i) => (i === 0 ? start : i === 1 ? second : start + i * delta));
  }

  // np.linspace(start, stop, num)
  function linspace(start, stop, num) {
    const step = (stop - start) / (num - 1);
    return Array.from({ length: num }, (_, i) => (i === num - 1 ? stop : i * step + start));
  }

  // np.polyfit(x, y, 1)
  function polyfitLine(xs, ys) {
    const n = xs.length;
    const meanX = mean(xs);
    const meanY = mean(ys);
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i += 1) {
      sxy += (xs[i] - meanX) * (ys[i] - meanY);
      sxx += (xs[i] - meanX) * (xs[i] - meanX);
    }
    const m = sxy / sxx;
    return [m, meanY - m * meanX];
  }

  // scipy.ndimage.gaussian_filter1d(profile, sigma) mit mode='reflect', truncate=4
  function gaussianFilter1d(profile, sigma) {
    const radius = Math.trunc(4 * sigma + 0.5);
    const weights = [];
    let total = 0;
    for (let x = -radius; x <= radius; x += 1) {
      const w = Math.exp(-0.5 * (x * x) / (sigma * sigma));
      weights.push(w);
      total += w;
    }
    const n = profile.length;
    const reflect = (i) => {
      const period = 2 * n;
      let j = ((i % period) + period) % period;
      return j < n ? j : period - 1 - j;
    };
    const out = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        sum += profile[reflect(i + k)] * (weights[k + radius] / total);
      }
      out[i] = sum;
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // 1. Papier finden und gerade ziehen
  // ---------------------------------------------------------------------------

  // Robuste Geradenanpassung across = m * along + c (Ausreißer werden verworfen)
  function fitLine(along, across) {
    let keep = along.map(() => true);
    let m = 0;
    let c = 0;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      [m, c] = polyfitLine(along.filter((_, i) => keep[i]), across.filter((_, i) => keep[i]));
      const resid = across.map((value, i) => Math.abs(value - (m * along[i] + c)));
      const limit = Math.max(5.0, 2.5 * median(resid.filter((_, i) => keep[i])));
      keep = resid.map((value) => value < limit);
    }
    return [m, c];
  }

  // Vier Punkte (oben links, oben rechts, unten rechts, unten links) des Blatts.
  // Verwendet werden nur die obere Kante sowie der obere Teil der Seitenkanten.
  function findPaperCorners(cv, bgr) {
    const height = bgr.rows;
    const width = bgr.cols;
    const lab = new cv.Mat();
    cv.cvtColor(bgr, lab, cv.COLOR_BGR2Lab);

    // Papier ist heller und weniger gelblich als der Holztisch
    const raw = new cv.Mat(height, width, cv.CV_32F);
    const labData = lab.data;
    const rawData = raw.data32F;
    for (let i = 0; i < width * height; i += 1) {
      rawData[i] = labData[3 * i] - 3 * (labData[3 * i + 2] - 128);
    }
    lab.delete();
    const score = new cv.Mat();
    cv.GaussianBlur(raw, score, new cv.Size(0, 0), 3);
    raw.delete();

    // cv2.normalize(..., 0, 255, NORM_MINMAX).astype(np.uint8)
    const scoreData = score.data32F;
    let min = Infinity;
    let max = -Infinity;
    for (const value of scoreData) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const scale = Math.fround(255 / (max - min));
    const s8 = new cv.Mat(height, width, cv.CV_8U);
    const s8Data = s8.data;
    for (let i = 0; i < scoreData.length; i += 1) {
      s8Data[i] = Math.trunc(Math.fround(Math.fround(scoreData[i] * scale) + Math.fround(-min * scale)));
    }
    score.delete();

    const paper = new cv.Mat();
    cv.threshold(s8, paper, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    s8.delete();
    const kernel = cv.Mat.ones(15, 15, cv.CV_8U);
    cv.morphologyEx(paper, paper, cv.MORPH_OPEN, kernel);
    kernel.delete();

    const labels = new cv.Mat();
    const stats = new cv.Mat();
    const centroids = new cv.Mat();
    const n = cv.connectedComponentsWithStats(paper, labels, stats, centroids);
    paper.delete();
    centroids.delete();
    if (n < 2) {
      labels.delete();
      stats.delete();
      throw new Error('Kein Blatt im Foto gefunden.');
    }
    const statsData = stats.data32S;
    let biggest = 1;
    for (let i = 2; i < n; i += 1) {
      if (statsData[i * 5 + 4] > statsData[biggest * 5 + 4]) biggest = i;
    }
    const [x0, y0, bw, bh] = statsData.slice(biggest * 5, biggest * 5 + 4);
    stats.delete();
    const labelData = labels.data32S;
    const isPaper = (x, y) => labelData[y * width + x] === biggest;

    // Obere Kante: oberster Papierpixel je Spalte (mittlere 70 %)
    const cols = arange(x0 + Math.trunc(0.15 * bw), x0 + Math.trunc(0.85 * bw), 4);
    const tops = cols.map((x) => {
      for (let y = 0; y < height; y += 1) if (isPaper(x, y)) return y;
      return 0;
    });
    const [mTop, cTop] = fitLine(cols, tops);

    // Linke/rechte Kante: äußerster Papierpixel je Zeile (oberer Bereich)
    const rows = arange(y0 + Math.trunc(0.05 * bh), y0 + Math.trunc(0.55 * bh), 4);
    const lefts = rows.map((y) => {
      for (let x = 0; x < width; x += 1) if (isPaper(x, y)) return x;
      return 0;
    });
    const rights = rows.map((y) => {
      for (let x = width - 1; x >= 0; x -= 1) if (isPaper(x, y)) return x;
      return width - 1;
    });
    labels.delete();
    const [mLeft, cLeft] = fitLine(rows, lefts);
    const [mRight, cRight] = fitLine(rows, rights);

    // Schnittpunkt Seitenkante x=m*y+c mit oberer Kante y=m*x+c
    const onTop = (mSide, cSide) => {
      const y = (mTop * cSide + cTop) / (1 - mTop * mSide);
      return [mSide * y + cSide, y];
    };
    // Untere Hilfskante: parallel zur oberen Kante, nahe am unteren Bildrand
    const shift = 0.95 * height - (mTop * width / 2 + cTop);
    const onBottom = (mSide, cSide) => {
      const y = (mTop * cSide + cTop + shift) / (1 - mTop * mSide);
      return [mSide * y + cSide, y];
    };

    return [onTop(mLeft, cLeft), onTop(mRight, cRight), onBottom(mRight, cRight), onBottom(mLeft, cLeft)]
      .map(([x, y]) => [Math.fround(x), Math.fround(y)]);
  }

  function straighten(cv, bgr, corners) {
    const source = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat());
    const target = cv.matFromArray(4, 1, cv.CV_32FC2,
      [0, 0, WARP_WIDTH, 0, WARP_WIDTH, WARP_HEIGHT, 0, WARP_HEIGHT]);
    const matrix = cv.getPerspectiveTransform(source, target);
    const straight = new cv.Mat();
    cv.warpPerspective(bgr, straight, matrix, new cv.Size(WARP_WIDTH, WARP_HEIGHT));
    source.delete();
    target.delete();
    matrix.delete();
    return straight;
  }

  // ---------------------------------------------------------------------------
  // 2. Raster finden
  // ---------------------------------------------------------------------------

  // Legt ein Raster aus `bands` gleich großen Bändern über das Profil.
  // Gesucht werden Start, Bandbreite und eine leichte Zu-/Abnahme der Bandbreite
  // (Restperspektive), sodass die Grenzen auf hellen Zwischenräumen und die
  // Bandmitten auf dunkleren Zellen liegen.
  function fitGridLines(profile, bands, minSize, maxSize) {
    const p = gaussianFilter1d(profile, 2);
    const n = p.length;
    const k = Array.from({ length: bands + 1 }, (_, i) => i);
    const centersK = k.slice(0, -1).map((i) => i + 0.5);
    const at = (v) => p[Math.min(n - 1, Math.max(0, roundHalfEven(v)))];
    let bestScore = -Infinity;
    let best = null;

    function score(start, size, growth) {
      const bounds = k.map((i) => start + size * i + growth * i * i);
      const centers = centersK.map((i) => start + size * i + growth * i * i);
      // Die letzte Spalte darf etwas aus dem Bild ragen (abgeschnittenes Foto)
      if (bounds[0] < 0 || centers[centers.length - 1] >= n) return -Infinity;
      const gapVals = bounds.slice(1, -1).map(at);
      const cellVals = centers.map(at);
      const edgeVals = [bounds[0], bounds[bounds.length - 1]].map(at);
      return mean(cellVals) - 0.7 * mean(gapVals) - 0.3 * mean(edgeVals);
    }

    function tryCandidate(start, size, growth) {
      const sc = score(start, size, growth);
      if (sc > bestScore) {
        bestScore = sc;
        best = [start, size, growth];
      }
    }

    for (const size of arange(minSize, maxSize, 2.0)) {
      const startLimit = Math.max(1, Math.trunc(n - size * (bands - 0.5)));
      for (let start = 0; start < startLimit; start += 4) {
        for (const growth of linspace(-0.6, 0.6, 7)) tryCandidate(start, size, growth);
      }
    }
    if (!best) throw new Error('Raster konnte nicht eingepasst werden.');

    // Feinabstimmung
    const [start0, size0, growth0] = best;
    for (const size of arange(size0 - 2, size0 + 2.01, 0.25)) {
      for (const start of arange(start0 - 4, start0 + 4.01, 0.5)) {
        for (const growth of linspace(growth0 - 0.1, growth0 + 0.1, 11)) tryCandidate(start, size, growth);
      }
    }
    const [start, size, growth] = best;
    return k.map((i) => Math.trunc(Math.min(n, Math.max(0, roundHalfEven(start + size * i + growth * i * i)))));
  }

  // Liefert die Zeilen- und Spaltengrenzen (rows+1 bzw. cols+1 Werte)
  function detectGrid(cv, lightness, rows, cols) {
    const height = lightness.rows;
    const width = lightness.cols;
    const dilated = new cv.Mat();
    const kernel = cv.Mat.ones(151, 151, cv.CV_8U);
    cv.dilate(lightness, dilated, kernel);
    kernel.delete();
    const localWhite = new cv.Mat();
    cv.GaussianBlur(dilated, localWhite, new cv.Size(0, 0), 30);
    dilated.delete();

    // Zellen sind dunkler als die weißen Zwischenräume (unabhängig vom Farbstich des Fotos);
    // Kappen, damit Tinte und dunkle Kopfzeile das Profil nicht dominieren
    const whiteData = localWhite.data32F;
    const lightData = lightness.data32F;
    const darkness = new Float32Array(width * height);
    for (let i = 0; i < darkness.length; i += 1) {
      darkness[i] = Math.min(25, Math.max(0, Math.fround(whiteData[i] - lightData[i])));
    }
    localWhite.delete();

    const colProfile = new Float64Array(width);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) colProfile[x] += darkness[y * width + x];
    }
    for (let x = 0; x < width; x += 1) colProfile[x] /= height;
    const xs = fitGridLines(colProfile, cols, width / (cols + 1.5), width / cols + 1);

    // Für die Zeilen nur den Tabellenbereich (ohne Personaspalte) betrachten
    const left = xs[1];
    const right = xs[xs.length - 1];
    const rowProfile = new Float64Array(height);
    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      for (let x = left; x < right; x += 1) sum += darkness[y * width + x];
      rowProfile[y] = sum / (right - left);
    }
    const ys = fitGridLines(rowProfile, rows, height / (rows + 8), height / rows + 1);
    return { ys, xs };
  }

  // ---------------------------------------------------------------------------
  // 3. Tinte messen
  // ---------------------------------------------------------------------------

  // Anteil schwarzer Tinte in einer Zelle. Der Rand wird links/rechts um `inset`
  // gekürzt, damit Papierkante oder Tisch nicht als Tinte zählen.
  function inkRatio(lab, top, bottom, left, right, inset = 0.12, darkerThan = INK_DARKER_THAN_CELL) {
    const margin = Math.trunc((right - left) * inset);
    const x0 = Math.max(0, left + margin);
    const x1 = Math.min(lab.width, right - margin);
    const y0 = Math.max(0, top);
    const y1 = Math.min(lab.height, bottom);
    if (x1 <= x0 || y1 <= y0) return 0;

    const histogram = new Uint32Array(256);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) histogram[lab.data[3 * (y * lab.width + x)]] += 1;
    }
    const count = (x1 - x0) * (y1 - y0);
    const nth = (index) => {
      let seen = 0;
      for (let value = 0; value < 256; value += 1) {
        seen += histogram[value];
        if (seen > index) return value;
      }
      return 255;
    };
    const cellMedian = count % 2 ? nth(count >> 1) : (nth(count / 2 - 1) + nth(count / 2)) / 2;
    const limit = cellMedian - darkerThan;

    // Tinte = deutlich dunkler als der Zellhintergrund und (anders als Holz) kaum farbig
    let ink = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = 3 * (y * lab.width + x);
        if (lab.data[i] < limit && Math.hypot(lab.data[i + 1] - 128, lab.data[i + 2] - 128) < 25) ink += 1;
      }
    }
    return ink / count;
  }

  // ---------------------------------------------------------------------------
  // Einen Pass auswerten
  // ---------------------------------------------------------------------------

  async function decodeImage(cv, file) {
    let bitmap;
    try {
      // Farbprofil ignorieren wie OpenCV in Python, Drehung aus den EXIF-Daten übernehmen
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', colorSpaceConversion: 'none' });
    } catch (error) {
      throw new Error(`„${file.name || 'Bild'}“ konnte nicht gelesen werden. Bitte ein JPEG- oder PNG-Foto verwenden.`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = cv.matFromImageData(context.getImageData(0, 0, canvas.width, canvas.height));
    const bgr = new cv.Mat();
    cv.cvtColor(rgba, bgr, cv.COLOR_RGBA2BGR);
    rgba.delete();
    return bgr;
  }

  // Liefert { freigaben, struck, struckUncertain, matrix, debug } für einen Pass.
  // `personNames` in der Reihenfolge wie auf dem Pass (= wie in der CSV).
  async function scanPass(file, personNames, featureNames) {
    const { cv } = await loadOpenCv();
    const bgr = await decodeImage(cv, file);
    let straight;
    let labMat;
    let lightness;
    try {
      const corners = findPaperCorners(cv, bgr);
      straight = straighten(cv, bgr, corners);
      labMat = new cv.Mat();
      cv.cvtColor(straight, labMat, cv.COLOR_BGR2Lab);
      lightness = new cv.Mat(labMat.rows, labMat.cols, cv.CV_32F);
      const lightData = lightness.data32F;
      for (let i = 0; i < lightData.length; i += 1) lightData[i] = labMat.data[3 * i];
      const { ys, xs } = detectGrid(cv, lightness, personNames.length + 1, featureNames.length + 1);
      const lab = { data: labMat.data, width: labMat.cols, height: labMat.rows };

      const matrix = [['Persona', ...featureNames]];
      const freigaben = {};
      const struck = [];
      const struckUncertain = [];
      const nameRatios = [];
      const cellRatios = [];

      personNames.forEach((person, pIdx) => {
        const top = ys[pIdx + 1];
        const bottom = ys[pIdx + 2];

        // 1) Ist der Name durchgestrichen?
        const nameRatio = inkRatio(lab, top, bottom, xs[0], xs[1], 0.05, NAME_INK_DARKER_THAN_CELL);
        nameRatios.push(nameRatio);
        if (nameRatio >= STRUCK_THRESHOLD) {
          struck.push(person);
          cellRatios.push(null);
          matrix.push([person, ...featureNames.map(() => '-')]);
          return;
        }
        if (nameRatio >= STRUCK_UNCERTAIN) struckUncertain.push(person);

        // 2) Merkmale auslesen
        const row = [person];
        const ratios = [];
        freigaben[person] = {};
        featureNames.forEach((feature, fIdx) => {
          const ratio = inkRatio(lab, top, bottom, xs[fIdx + 1], xs[fIdx + 2]);
          const value = ratio >= MARK_THRESHOLD ? 'X' : ratio >= UNCERTAIN_THRESHOLD ? '!' : '';
          ratios.push(ratio);
          row.push(value);
          freigaben[person][feature] = value === 'X';
        });
        cellRatios.push(ratios);
        matrix.push(row);
      });

      return {
        freigaben,
        struck,
        struckUncertain,
        matrix,
        debug: { size: [bgr.rows, bgr.cols], corners, ys, xs, nameRatios, cellRatios }
      };
    } finally {
      [bgr, straight, labMat, lightness].forEach((mat) => mat?.delete());
    }
  }

  // Wertet mehrere Pässe aus und baut daraus das Format von freigaben.json.
  // passes: [{ color: 'Grün', file, personNames }]
  async function scanPasses(passes, featureNames) {
    const data = { merkmale: featureNames, personas: {}, ausgeschlossen: {} };
    const uncertain = [];
    const results = {};
    for (const { color, file, personNames } of passes) {
      let result;
      try {
        result = await scanPass(file, personNames, featureNames);
      } catch (error) {
        throw new Error(`${color}er Pass: ${error.message}`);
      }
      results[color] = result;
      data.personas[color] = result.freigaben;
      data.ausgeschlossen[color] = result.struck;
      result.struckUncertain.forEach((person) => {
        uncertain.push(`${color} / ${person} / Name evtl. durchgestrichen`);
      });
      result.matrix.slice(1).forEach(([person, ...values]) => {
        values.forEach((value, index) => {
          if (value === '!') uncertain.push(`${color} / ${person} / ${featureNames[index]}`);
        });
      });
    }
    return { data, uncertain, results };
  }

  window.PassScanner = { loadOpenCv, scanPass, scanPasses };
})();
