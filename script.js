const iconPool = ['🧑‍🎓', '🧑‍💻', '👩‍🏫', '🧑‍🚀', '👩‍🎤', '🧑‍⚕️', '🧑‍🌾', '🧑‍🏫', '👩‍💼', '🧑‍🎨'];
const PERSONA_COUNT_INTERVAL_MS = 500;
const STORED_PASS_KEY = 'cookiemaster.freigaben';
let freigabenData = null;
let freigabenError = null;
let personaCountTimer = null;
let personaPositionAnimations = [];
let personaAudioContext = null;

function preparePersonaAudio() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    console.warn('Web Audio wird in diesem Browser nicht unterstützt.');
    return;
  }

  if (!personaAudioContext) {
    personaAudioContext = new AudioContextConstructor();
  }

  if (personaAudioContext.state === 'suspended') {
    personaAudioContext.resume().catch((error) => {
      console.warn('Nachrichtenton konnte nicht aktiviert werden.', error);
    });
  }
}

function playIncomingMessageSound() {
  if (!personaAudioContext || personaAudioContext.state !== 'running') return;

  const startTime = personaAudioContext.currentTime;
  [740, 988].forEach((frequency, index) => {
    const noteStart = startTime + index * 0.11;
    const oscillator = personaAudioContext.createOscillator();
    const volume = personaAudioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    volume.gain.setValueAtTime(0.0001, noteStart);
    volume.gain.exponentialRampToValueAtTime(0.1, noteStart + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.13);
    oscillator.connect(volume);
    volume.connect(personaAudioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.14);
  });
}

function cancelPersonaCountAnimation() {
  if (personaCountTimer !== null) {
    window.clearInterval(personaCountTimer);
    personaCountTimer = null;
  }
  personaPositionAnimations.forEach((animation) => {
    animation.finish();
    animation.cancel();
  });
  personaPositionAnimations = [];
}

function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function normalizeUnicode(value) {
  return String(value ?? '').trim().normalize('NFC');
}

function normalizeFeatureName(value) {
  const raw = String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const normalized = raw
    .replace(/\?+$/g, '')
    .replace(/[:*]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.includes('lieblingsmusiker') && normalized.endsWith('in')) {
    return 'lieblingsmusiker:in';
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

function normalizePersonName(value) {
  return normalizeUnicode(value).replace(/^\uFEFF/, '').replace(/\s+/g, ' ').toLowerCase().normalize('NFC');
}

function detectDelimiter(text) {
  const firstLine = (String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) || '')
    .trim();

  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount >= commaCount ? ';' : ',';
}

function parseCsv(text) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(cleaned);
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(delimiter).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((value) => value.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });

  return { headers, rows };
}

function getPersonaNameColumn(headers) {
  return headers.find((header) => normalizePersonName(header) === 'name') || headers[0];
}

function getPersonaFeatures(headers) {
  return headers.filter((header) => {
    const normalized = normalizeFeatureName(header);
    return !['farbe', 'name', 'bilddatei'].includes(normalized);
  });
}

function getPersonaValue(row, headers, columnName) {
  const normalizedColumn = normalizeFeatureName(columnName);
  const header = headers.find((candidate) => normalizeFeatureName(candidate) === normalizedColumn);
  return header ? String(row[header] || '').trim() : '';
}

function personaKey(farbe, name) {
  return `${normalizePersonName(farbe)}-${normalizePersonName(name)}`;
}

function getPersonaImageUrl(imagePath) {
  return imagePath ? `../data/${imagePath}` : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function findNormalizedKey(object, value, normalize) {
  const wanted = normalize(value);
  return Object.keys(object || {}).find((key) => normalize(key) === wanted);
}

function getFreigaben(farbe, name) {
  const colors = freigabenData?.personas;
  const colorKey = findNormalizedKey(colors, farbe, normalizePersonName);
  const personas = colorKey ? colors[colorKey] : null;
  const nameKey = findNormalizedKey(personas, name, normalizePersonName);
  if (!nameKey) {
    throw new Error(`Für „${normalizeUnicode(name)}“ in „${normalizeUnicode(farbe)}“ fehlen Freigaben.`);
  }
  return personas[nameKey];
}

function isAusgeschlossen(farbe, name) {
  const exclusions = freigabenData?.ausgeschlossen;
  const colorKey = findNormalizedKey(exclusions, farbe, normalizePersonName);
  const names = colorKey ? exclusions[colorKey] : [];
  return Array.isArray(names) &&
    names.some((excludedName) => normalizePersonName(excludedName) === normalizePersonName(name));
}

function hasValidFreigaben(farbe, name) {
  const colors = freigabenData?.personas;
  const colorKey = findNormalizedKey(colors, farbe, normalizePersonName);
  const personas = colorKey ? colors[colorKey] : null;
  const nameKey = findNormalizedKey(personas, name, normalizePersonName);
  const freigaben = nameKey ? personas[nameKey] : null;
  return freigaben && typeof freigaben === 'object' && !Array.isArray(freigaben) &&
    (freigabenData.merkmale || []).every((feature) => {
      const key = findNormalizedKey(freigaben, feature, normalizeUnicode);
      return key && typeof freigaben[key] === 'boolean';
    });
}

function getAktivePersonas(csvData) {
  const headers = csvData.headers || [];
  return (csvData.rows || []).filter((row) => {
    const name = getPersonaValue(row, headers, 'Name');
    const color = getPersonaValue(row, headers, 'Farbe');
    return name && color && !isAusgeschlossen(color, name) && hasValidFreigaben(color, name);
  });
}

function getFreigegebeneMerkmale(farbe, name) {
  const freigaben = getFreigaben(farbe, name);
  return (freigabenData.merkmale || []).filter((feature) => {
    const featureKey = findNormalizedKey(freigaben, feature, normalizeUnicode);
    return featureKey && freigaben[featureKey] === true;
  });
}

async function readPhishingTemplates() {
  const response = await fetch('../data/phishing_vorlagen.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('phishing_vorlagen.json konnte nicht geladen werden.');
  }
  return response.json();
}

async function readCsvFile() {
  const response = await fetch('../data/Personas.csv', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Personas.csv konnte nicht geladen werden.');
  }
  return parseCsv(await response.text());
}

// Ohne hochgeladenen Pass: alle Personas spielen mit, aber kein Merkmal ist freigegeben.
function buildEmptyPassData(csvData) {
  const headers = csvData.headers || [];
  const nameColumn = getPersonaNameColumn(headers);
  const colorColumn = headers.find((header) => normalizePersonName(header) === 'farbe');
  if (!colorColumn) throw new Error('CSV-Spalte „Farbe“ fehlt.');
  const merkmale = getPersonaFeatures(headers).map(normalizeUnicode).filter(Boolean);
  const personas = {};
  for (const row of csvData.rows || []) {
    const color = normalizeUnicode(row[colorColumn]);
    const name = normalizeUnicode(row[nameColumn]);
    if (!color || !name) continue;
    personas[color] = personas[color] || {};
    personas[color][name] = Object.fromEntries(merkmale.map((feature) => [feature, false]));
  }
  return { merkmale, personas, ausgeschlossen: {} };
}

// Hochgeladene Pässe werden im Browser gespeichert, damit auch die Detailseite sie kennt.
function readStoredPassData() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORED_PASS_KEY) || 'null');
    return stored && stored.data ? stored : null;
  } catch (error) {
    return null;
  }
}

function storePassData(data) {
  try {
    window.localStorage.setItem(STORED_PASS_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data }));
    return true;
  } catch (error) {
    return false;
  }
}

// Zuletzt hochgeladene Pässe, sonst keine Freigaben (als wäre kein Pass hochgeladen)
async function readPassData() {
  const stored = readStoredPassData();
  if (stored) return stored;
  return { data: buildEmptyPassData(await readCsvFile()), savedAt: null };
}

// Neu hochgeladene Pässe sollen in der Übersicht einmal animiert erscheinen.
const SHOWN_PASS_KEY = 'cookiemaster.shownPass';
function consumeNewPassAnimation() {
  try {
    const stored = readStoredPassData();
    if (!stored || !stored.savedAt) return false;
    if (window.localStorage.getItem(SHOWN_PASS_KEY) === stored.savedAt) return false;
    window.localStorage.setItem(SHOWN_PASS_KEY, stored.savedAt);
    return true;
  } catch (error) {
    return false;
  }
}

function formatSavedAt(savedAt) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(savedAt));
}

async function scanUploadedPasses(gruenFile, orangeFile) {
  const csvData = await readCsvFile();
  const headers = csvData.headers || [];
  const nameColumn = getPersonaNameColumn(headers);
  const colorColumn = headers.find((header) => normalizePersonName(header) === 'farbe');
  if (!colorColumn) throw new Error('CSV-Spalte „Farbe“ fehlt.');
  const featureNames = getPersonaFeatures(headers);

  // Reihenfolge der Personas wie in der CSV = Reihenfolge auf dem Pass
  const passes = [['grün', gruenFile], ['orange', orangeFile]].map(([colorKey, file]) => {
    const rows = (csvData.rows || []).filter((row) => normalizePersonName(row[colorColumn]) === colorKey);
    if (!rows.length) throw new Error(`Keine Personas mit der Farbe „${colorKey}“ in Personas.csv.`);
    return { color: rows[0][colorColumn], file, personNames: rows.map((row) => row[nameColumn]) };
  });

  updateUploadStatusBar('Bilderkennung wird geladen…');
  await window.PassScanner.loadOpenCv();
  updateUploadStatusBar('Datensammelpässe werden ausgewertet…');
  // Kurz warten, damit die Statusmeldung vor der Rechenarbeit angezeigt wird
  await new Promise((resolve) => window.setTimeout(resolve, 50));
  const { data, uncertain, results } = await window.PassScanner.scanPasses(passes, featureNames);
  renderScanReview(results, featureNames);
  return { data, uncertain, saved: storePassData(data) };
}

function renderScanReview(results, featureNames) {
  const review = document.getElementById('scan-review');
  const tables = document.getElementById('scan-review-tables');
  if (!review || !tables) return;
  const cellLabel = { X: '✓', '!': '?', '': '', '-': '–' };
  const cellClass = { X: 'marked', '!': 'uncertain' };

  tables.innerHTML = Object.entries(results).map(([color, result]) => `
    <div class="pass-preview-card">
      <h3>${escapeHtml(color)}</h3>
      <div class="table-wrap">
        <table class="pass-matrix-table">
          <thead>
            <tr><th>Persona</th>${featureNames.map((feature) => `<th>${escapeHtml(feature)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${result.matrix.slice(1).map(([person, ...values]) => `
              <tr>
                <th>${escapeHtml(person)}${result.struck.includes(person) ? ' (gestrichen)' : ''}</th>
                ${values.map((value) => `<td class="${cellClass[value] || ''}">${cellLabel[value]}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
  tables.insertAdjacentHTML('beforeend',
    '<p class="pass-preview-note">✓ = freigegeben, ? = unsicher (zählt als nicht freigegeben), – = Persona spielt nicht mit</p>');
  review.hidden = false;
}

function normalizePassData(rawPassData, csvData) {
  const headers = csvData.headers || [];
  const nameColumn = getPersonaNameColumn(headers);
  const colorColumn = headers.find((header) => normalizePersonName(header) === 'farbe');
  if (!colorColumn) throw new Error('CSV-Spalte „Farbe“ fehlt.');
  const csvFeatures = getPersonaFeatures(headers).map(normalizeUnicode).filter(Boolean);
  if (!rawPassData || typeof rawPassData !== 'object' ||
      !Array.isArray(rawPassData.merkmale) ||
      !rawPassData.personas || typeof rawPassData.personas !== 'object') {
    throw new Error('freigaben.json muss das farbgetrennte Format mit „merkmale“ und „personas“ enthalten.');
  }

  const csvColors = new Map();
  for (const row of csvData.rows || []) {
    const color = normalizeUnicode(row[colorColumn]);
    const name = normalizeUnicode(row[nameColumn]);
    if (!color || !name) continue;
    const colorKey = normalizePersonName(color);
    if (!csvColors.has(colorKey)) csvColors.set(colorKey, { color, names: new Map() });
    csvColors.get(colorKey).names.set(normalizePersonName(name), name);
  }

  const jsonFeatures = rawPassData.merkmale.map(normalizeUnicode);
  const csvFeatureSet = new Set(csvFeatures);
  const jsonFeatureSet = new Set(jsonFeatures);
  const missingFeatures = csvFeatures.filter((feature) => !jsonFeatureSet.has(feature));
  const extraFeatures = jsonFeatures.filter((feature) => !csvFeatureSet.has(feature));
  const missingPersons = [];
  const extraPersons = [];
  const invalidEntries = [];
  const jsonColors = rawPassData.personas;
  const exclusionsProvided = Object.prototype.hasOwnProperty.call(rawPassData, 'ausgeschlossen');
  const exclusionSource = exclusionsProvided ? rawPassData.ausgeschlossen : {};
  const exclusionsAreValid = exclusionSource && typeof exclusionSource === 'object' && !Array.isArray(exclusionSource);
  const rawExclusions = exclusionsAreValid ? exclusionSource : {};
  if (exclusionsProvided && !exclusionsAreValid) {
    invalidEntries.push('„ausgeschlossen“ ist keine gültige Farbliste');
  }

  for (const [rawColor, rawPersonas] of Object.entries(jsonColors)) {
    const normalizedColor = normalizePersonName(rawColor);
    const csvColor = csvColors.get(normalizedColor);
    if (!csvColor) {
      extraPersons.push(`${rawColor}: (unbekannte Farbe)`);
      continue;
    }
    if (!rawPersonas || typeof rawPersonas !== 'object' || Array.isArray(rawPersonas)) {
      invalidEntries.push(`${rawColor}: ungültige Persona-Liste`);
      continue;
    }
    for (const [rawName, flags] of Object.entries(rawPersonas)) {
      const normalizedName = normalizePersonName(rawName);
      if (!csvColor.names.has(normalizedName)) {
        extraPersons.push(`${csvColor.color}: ${rawName}`);
        continue;
      }
      if (!flags || typeof flags !== 'object' || Array.isArray(flags)) {
        invalidEntries.push(`${csvColor.color}: ${rawName} hat ungültige Freigaben`);
        continue;
      }
      for (const feature of csvFeatures) {
        const key = findNormalizedKey(flags, feature, normalizeUnicode);
        if (!key) {
          invalidEntries.push(`${csvColor.color}: ${rawName} / ${feature} fehlt`);
        } else if (typeof flags[key] !== 'boolean') {
          invalidEntries.push(`${csvColor.color}: ${rawName} / ${feature} ist kein boolescher Wert`);
        }
      }
    }
  }

  for (const [rawColor, rawNames] of Object.entries(rawExclusions)) {
    const csvColor = csvColors.get(normalizePersonName(rawColor));
    if (!csvColor) {
      extraPersons.push(`${rawColor}: (unbekannte Ausschlussfarbe)`);
      continue;
    }
    if (!Array.isArray(rawNames)) {
      invalidEntries.push(`${csvColor.color}: ungültige Ausschlussliste`);
      continue;
    }
    for (const rawName of rawNames) {
      if (typeof rawName !== 'string' || !csvColor.names.has(normalizePersonName(rawName))) {
        extraPersons.push(`${csvColor.color}: ${String(rawName)} (unbekannter Ausschluss)`);
      }
    }
  }

  for (const [colorKey, csvColor] of csvColors) {
    const rawColorKey = findNormalizedKey(jsonColors, colorKey, normalizePersonName);
    const rawPersonas = rawColorKey ? jsonColors[rawColorKey] : null;
    const rawExclusionColor = findNormalizedKey(rawExclusions, colorKey, normalizePersonName);
    const excludedNames = new Set(
      rawExclusionColor && Array.isArray(rawExclusions[rawExclusionColor])
        ? rawExclusions[rawExclusionColor].map(normalizePersonName)
        : []
    );
    for (const [nameKey, name] of csvColor.names) {
      if (!excludedNames.has(nameKey) && !findNormalizedKey(rawPersonas, name, normalizePersonName)) {
        missingPersons.push(`${csvColor.color}: ${name}`);
      }
    }
  }

  return {
    data: rawPassData,
    missingFeatures,
    extraFeatures,
    missingPersons,
    extraPersons,
    invalidEntries
  };
}

function buildMismatchMessage(mismatch) {
  const parts = ['Abweichungen zwischen Datensammelpass und CSV:'];

  if (mismatch.missingFeatures.length) {
    parts.push(`Fehlende Merkmale im Pass: ${mismatch.missingFeatures.join(', ')}`);
  }
  if (mismatch.extraFeatures.length) {
    parts.push(`Zusätzliche Merkmale im Pass: ${mismatch.extraFeatures.join(', ')}`);
  }
  if (mismatch.missingPersons.length) {
    parts.push(`Fehlende Personas im Pass: ${mismatch.missingPersons.join(', ')}`);
  }
  if (mismatch.extraPersons.length) {
    parts.push(`Zusätzliche Personas im Pass: ${mismatch.extraPersons.join(', ')}`);
  }
  if (mismatch.invalidEntries.length) {
    parts.push(`Ungültige Freigaben: ${mismatch.invalidEntries.join(', ')}`);
  }

  return parts.join(' ');
}

async function loadFreshPassData() {
  try {
    const csvData = await readCsvFile();
    const { data: rawPassData, savedAt } = await readPassData();
    const normalized = normalizePassData(rawPassData, csvData);

    const hasMismatches = (
      normalized.missingFeatures.length ||
      normalized.extraFeatures.length ||
      normalized.missingPersons.length ||
      normalized.extraPersons.length ||
      normalized.invalidEntries.length
    );
    const message = hasMismatches ? buildMismatchMessage(normalized) : '';
    if (message) console.warn(message);

    return { ok: true, data: normalized.data, warning: message, savedAt };
  } catch (error) {
    return {
      ok: false,
      message: error && error.message ? error.message : 'Datensammelpass konnte nicht geladen werden.'
    };
  }
}

function updateUploadStatusBar(message, variant = 'empty') {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-bar ${variant}`;
}

async function renderOverviewPage({ animateCounts = false } = {}) {
  const list = document.getElementById('persona-list');
  if (!list) return;
  cancelPersonaCountAnimation();
  const shouldAnimateCounts = animateCounts && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colorFilter = document.getElementById('persona-color-filter');
  const resetButton = document.getElementById('reset-freigaben');

  function applyColorFilter() {
    const selectedColor = normalizePersonName(colorFilter?.value || 'alle');
    list.querySelectorAll('.persona-card').forEach((card) => {
      const matches = selectedColor === 'alle' ||
        normalizePersonName(card.dataset.personaColor) === selectedColor;
      card.hidden = !matches;
    });
  }

  if (colorFilter) colorFilter.onchange = applyColorFilter;
  if (resetButton) {
    resetButton.onclick = async () => {
      cancelPersonaCountAnimation();
      try {
        window.localStorage.removeItem(STORED_PASS_KEY);
        window.localStorage.removeItem(SHOWN_PASS_KEY);
      } catch (error) {
        console.warn('Gespeicherter Datensammelpass konnte nicht gelöscht werden.', error);
      }
      await loadPassStateForDisplay();
      await renderOverviewPage();
    };
  }

  try {
    if (freigabenError || !freigabenData) {
      list.innerHTML = `<p class="empty-state">${escapeHtml(freigabenError || 'Freigaben konnten nicht geladen werden.')}</p>`;
      return;
    }
    const csvData = await readCsvFile();
    const headers = csvData.headers || [];
    const previousOrder = new Map(
      [...list.querySelectorAll('.persona-card')].map((card, index) => [card.dataset.personaKey, index])
    );
    let rows = getAktivePersonas(csvData)
      .map((row, index) => {
        const name = getPersonaValue(row, headers, 'Name') || 'Unbekannt';
        const color = getPersonaValue(row, headers, 'Farbe');
        return {
          row,
          index,
          key: personaKey(color, name),
          count: getFreigegebeneMerkmale(color, name).length
        };
      });
    if (shouldAnimateCounts) {
      shuffleArray(rows);
    } else {
      rows.sort((a, b) => b.count - a.count ||
        (previousOrder.get(a.key) ?? a.index) - (previousOrder.get(b.key) ?? b.index));
    }
    list.innerHTML = rows
      .map(({ row, index, key, count }) => {
        const name = getPersonaValue(row, headers, 'Name') || 'Unbekannt';
        const color = getPersonaValue(row, headers, 'Farbe');
        const imagePath = getPersonaValue(row, headers, 'Bilddatei');
        const colorClass = normalizePersonName(color) === 'grün'
          ? 'persona-card-green'
          : normalizePersonName(color) === 'orange' ? 'persona-card-orange' : '';
        const displayedCount = shouldAnimateCounts ? 0 : count;
        const badgeClass = count === 0 ? 'zero' : count > 2 ? 'high' : 'medium';
        const badge = `<span class="phishing-badge badge-${badgeClass}" aria-label="${displayedCount} Phishing-Nachricht${displayedCount === 1 ? '' : 'en'}" title="${displayedCount} Phishing-Nachricht${displayedCount === 1 ? '' : 'en'}"><span class="phishing-count">${displayedCount}</span></span>`;
        const avatar = imagePath
          ? `<img class="persona-image" src="${escapeHtml(getPersonaImageUrl(imagePath))}" alt="${escapeHtml(name)}" loading="lazy"><span class="persona-icon" aria-hidden="true" hidden>${iconPool[index % iconPool.length]}</span>`
          : `<span class="persona-icon" aria-hidden="true">${iconPool[index % iconPool.length]}</span>`;

        return `
          <button id="persona-${escapeHtml(key)}" class="persona-card ${colorClass}" type="button" data-persona-key="${escapeHtml(key)}" data-persona-name="${escapeHtml(name)}" data-persona-color="${escapeHtml(color)}" data-target-count="${count}" data-current-count="${displayedCount}" aria-label="${escapeHtml(`${name} (${color})`)}">
            ${badge}
            <span class="persona-avatar">${avatar}</span>
            <span class="persona-name">${escapeHtml(name)}</span>
          </button>
        `;
      })
      .join('');

    applyColorFilter();
    attachImageFallbacks(list);
    list.querySelectorAll('.persona-card').forEach((button) => {
      button.addEventListener('click', () => {
        const params = new URLSearchParams({
          farbe: button.dataset.personaColor,
          name: button.dataset.personaName
        });
        window.location.href = `detail.html?${params.toString()}#so-koennten-betrueger-deine-daten-nutzen`;
      });
    });

    if (shouldAnimateCounts) {
      startPersonaCountAnimation(list);
    } else {
      list.querySelectorAll('.persona-card').forEach((card) => card.classList.add('count-complete'));
    }
  } catch (error) {
    list.innerHTML = '<p class="empty-state">Personas konnten nicht geladen werden.</p>';
  }
}

function renderUploadPage() {
  const loadButton = document.getElementById('load-freigaben');
  if (!loadButton) return;

  loadButton.onclick = async () => {
    const gruenFile = document.getElementById('pass-gruen')?.files[0];
    const orangeFile = document.getElementById('pass-orange')?.files[0];
    if (Boolean(gruenFile) !== Boolean(orangeFile)) {
      updateUploadStatusBar('Bitte beide Datensammelpässe auswählen – den grünen und den orangen.', 'error');
      return;
    }

    loadButton.disabled = true;
    try {
      let scan = null;
      if (gruenFile && orangeFile) {
        try {
          scan = await scanUploadedPasses(gruenFile, orangeFile);
        } catch (error) {
          updateUploadStatusBar(`Auswertung fehlgeschlagen: ${error.message || error}`, 'error');
          return;
        }
      } else {
        updateUploadStatusBar('Freigaben werden neu geladen…');
      }

      await loadPassStateForDisplay();
      if (scan && !scan.saved) {
        freigabenData = scan.data;
        freigabenError = null;
        updateUploadStatusBar('Ausgewertet – konnte im Browser nicht gespeichert werden, Übersicht und Detailseiten zeigen daher keine Merkmale.', 'warning');
      } else if (scan && scan.uncertain.length) {
        updateUploadStatusBar(`Ausgewertet – bitte prüfen (zählt als nicht freigegeben): ${scan.uncertain.join(', ')}`, 'warning');
      }
    } finally {
      loadButton.disabled = false;
    }
  };
}

function startPersonaCountAnimation(list) {
  const cards = [...list.querySelectorAll('.persona-card')];
  cards.forEach((card) => {
    if (Number(card.dataset.targetCount) === 0) card.classList.add('count-complete');
  });

  if (cards.every((card) => Number(card.dataset.targetCount) === 0)) return;

  function sortAndAnimateCards(cardsBeforeSort) {
    personaPositionAnimations.forEach((animation) => {
      animation.finish();
      animation.cancel();
    });
    personaPositionAnimations = [];

    const previousPositions = new Map(
      cardsBeforeSort.map((card) => [card, card.getBoundingClientRect()])
    );
    const currentOrder = new Map(cardsBeforeSort.map((card, index) => [card, index]));
    const sortedCards = cardsBeforeSort.sort((a, b) =>
      Number(b.dataset.currentCount) - Number(a.dataset.currentCount) ||
      currentOrder.get(a) - currentOrder.get(b)
    );
    list.replaceChildren(...sortedCards);

    sortedCards.forEach((card) => {
      const before = previousPositions.get(card);
      const after = card.getBoundingClientRect();
      const deltaX = before.left - after.left;
      const deltaY = before.top - after.top;
      if (deltaX || deltaY) {
        const animation = card.animate(
          [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 500, easing: 'ease-in-out' }
        );
        personaPositionAnimations.push(animation);
        animation.addEventListener('finish', () => {
          personaPositionAnimations = personaPositionAnimations.filter((item) => item !== animation);
        }, { once: true });
      }
    });
  }

  personaCountTimer = window.setInterval(() => {
    const activeCards = [...list.querySelectorAll('.persona-card')];
    activeCards.forEach((card) => {
      const currentCount = Number(card.dataset.currentCount);
      const targetCount = Number(card.dataset.targetCount);
      if (currentCount >= targetCount) return;

      const nextCount = currentCount + 1;
      card.dataset.currentCount = String(nextCount);
      const badge = card.querySelector('.phishing-badge');
      badge.querySelector('.phishing-count').textContent = String(nextCount);
      badge.setAttribute('aria-label', `${nextCount} Phishing-Nachricht${nextCount === 1 ? '' : 'en'}`);
      badge.title = `${nextCount} Phishing-Nachricht${nextCount === 1 ? '' : 'en'}`;
      badge.classList.remove('count-pop');

      if (nextCount >= targetCount) {
        card.classList.add('count-complete');
      } else {
        void badge.offsetWidth;
        badge.classList.add('count-pop');
      }
    });

    const hasBlinkingCards = activeCards.some(
      (card) => Number(card.dataset.currentCount) < Number(card.dataset.targetCount)
    );
    if (hasBlinkingCards) playIncomingMessageSound();

    sortAndAnimateCards(activeCards);

    const allComplete = activeCards.every(
      (card) => Number(card.dataset.currentCount) >= Number(card.dataset.targetCount)
    );
    if (allComplete) {
      window.clearInterval(personaCountTimer);
      personaCountTimer = null;
    }
  }, PERSONA_COUNT_INTERVAL_MS);
}

async function renderDetailPage() {
  const detailCard = document.getElementById('detail-card');
  if (!detailCard) return;

  const params = new URLSearchParams(window.location.search);
  const selectedColor = params.get('farbe');
  const selectedName = params.get('name');
  if (!selectedColor || !selectedName) {
    detailCard.innerHTML = '<p class="empty-state">Zum Anzeigen bitte Farbe und Name in der URL angeben.</p>';
    return;
  }

  try {
    const csvData = await readCsvFile();
    const headers = csvData.headers || [];
    const personaRow = (csvData.rows || []).find(
      (row) => {
        const rowName = getPersonaValue(row, headers, 'Name');
        const rowColor = getPersonaValue(row, headers, 'Farbe');
        return normalizePersonName(rowName) === normalizePersonName(selectedName) &&
          normalizePersonName(rowColor) === normalizePersonName(selectedColor);
      }
    );

    if (!personaRow) {
      detailCard.innerHTML = `<p class="empty-state">Keine Persona „${escapeHtml(selectedName)}“ mit der Farbe „${escapeHtml(selectedColor)}“ gefunden.</p>`;
      return;
    }

    const personaName = getPersonaValue(personaRow, headers, 'Name');
    const personaColor = getPersonaValue(personaRow, headers, 'Farbe');
    const imagePath = getPersonaValue(personaRow, headers, 'Bilddatei');
    if (isAusgeschlossen(personaColor, personaName)) {
      detailCard.innerHTML = '<p class="empty-state">Diese Persona spielt in dieser Runde nicht mit.</p>';
      return;
    }
    if (freigabenError) {
      throw new Error(freigabenError);
    }
    const sharedFeatureNames = getFreigegebeneMerkmale(personaColor, personaName);
    const featureEntries = sharedFeatureNames.map((feature) => {
      const featureColumn = headers.find((header) => normalizeUnicode(header) === normalizeUnicode(feature));
      if (!featureColumn) {
        throw new Error(`Das Merkmal „${feature}“ fehlt in Personas.csv.`);
      }
      return {
        feature,
        sharedValue: String(personaRow[featureColumn] || '').trim()
      };
    });

    const allFeatureCount = getPersonaFeatures(headers).length;
    const privateCount = allFeatureCount - featureEntries.length;

    const phishingTemplates = await readPhishingTemplates();
    const key = personaKey(personaColor, personaName);
    const phishingMessages = featureEntries
      .map((entry, index) => {
        const template = phishingTemplates[entry.feature];
        if (!template) {
          return null;
        }

        const text = template.text
          .replace(/\{name\}/g, personaName)
          .replace(/\{wert\}/g, entry.sharedValue);
        const sender = template.sender.includes('{wert}')
          ? template.sender.replace(/\{wert\}/g, entry.sharedValue)
          : template.sender;

        return {
          id: `${key}-phishing-${index}`,
          type: 'incoming',
          sender,
          text: `${text}\nhttps://gewinn-link.example`,
          time: new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
          warningSigns: template.warning_signs || []
        };
      })
      .filter(Boolean);

    const icon = iconPool[Math.abs(personaName.length) % iconPool.length];
    const avatar = imagePath
      ? `<img class="persona-image detail-image" src="${escapeHtml(getPersonaImageUrl(imagePath))}" alt="${escapeHtml(personaName)}"><span class="detail-icon" aria-hidden="true" hidden>${icon}</span>`
      : `<span class="detail-icon" aria-hidden="true">${icon}</span>`;

    detailCard.classList.remove('persona-card-green', 'persona-card-orange');
    const colorClass = normalizePersonName(personaColor) === 'grün'
      ? 'persona-card-green'
      : normalizePersonName(personaColor) === 'orange' ? 'persona-card-orange' : '';
    if (colorClass) detailCard.classList.add(colorClass);
    detailCard.innerHTML = `
      <div class="detail-header-box">
        ${avatar}
        <h2 class="detail-name">${escapeHtml(personaName)}</h2>
      </div>
      <section class="persona-dashboard" aria-label="Übersicht veröffentlichter Informationen">
        <div class="dashboard-stat dashboard-stat-shared">
          <span class="dashboard-stat-value">${featureEntries.length}</span>
          <span class="dashboard-stat-label">Veröffentlichte Informationen</span>
        </div>
        <div class="dashboard-stat dashboard-stat-private">
          <span class="dashboard-stat-value">${privateCount}</span>
          <span class="dashboard-stat-label">Nicht veröffentlichte Informationen</span>
        </div>
        <button
          class="dashboard-mailbox"
          type="button"
          aria-label="Postfach mit ${featureEntries.length} ${featureEntries.length === 1 ? 'Nachricht' : 'Nachrichten'}"
        >
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M6 9h36v30H6z" />
            <path d="M6 25h10l4 7h8l4-7h10" />
          </svg>
          <span class="dashboard-mailbox-count">${featureEntries.length}</span>
          <span class="dashboard-stat-label">${featureEntries.length === 1 ? 'Nachricht' : 'Nachrichten'}</span>
        </button>
      </section>
      <details class="feature-disclosure">
        <summary>Merkmale anzeigen</summary>
        <ul class="detail-list">
          ${featureEntries.length ? featureEntries
            .map(
              ({ feature, sharedValue }) => `
                <li class="detail-item">
                  <span class="detail-label">${escapeHtml(feature)}</span>
                  <span class="detail-value">${escapeHtml(sharedValue)}</span>
                </li>
              `
            )
            .join('') : '<li class="empty-state">Für diese Persona sind keine Merkmale freigegeben.</li>'}
        </ul>
      </details>
    `;

    attachImageFallbacks(detailCard);
    const mailboxButton = detailCard.querySelector('.dashboard-mailbox');
    const chatOverlay = document.getElementById('persona-chat-overlay');
    const chatContainer = document.getElementById('persona-chat');
    let activeChat;

    function closeMailbox() {
      if (chatOverlay.hidden) return;
      chatOverlay.hidden = true;
      document.body.classList.remove('chat-modal-open');
      activeChat?.destroy();
      activeChat = null;
      chatContainer.replaceChildren();
      mailboxButton.focus();
    }

    mailboxButton.addEventListener('click', () => {
      const noMessages = phishingMessages.length === 0;
      const chatMessages = [
        { type: 'date', text: 'Heute' },
        {
          type: 'system',
          text: noMessages
            ? 'Für diese Persona gibt es keine Phishing-Beispiele, weil keine Merkmale freigegeben wurden.'
            : 'Simulation – erkenne die Warnzeichen, bevor du reagierst.'
        },
        ...phishingMessages
      ];
      const phishingById = new Map(phishingMessages.map((message) => [message.id, message]));

      chatOverlay.hidden = false;
      document.body.classList.add('chat-modal-open');
      activeChat = window.createGameChat(chatContainer, {
        data: {
          contact: {
            name: phishingMessages[0]?.sender || 'Unbekannte Nummer',
            avatar: '',
            unreadCount: phishingMessages.length
          },
          statusBar: { network: 'LTE', battery: 75 },
          messages: chatMessages
        },
        onBack: closeMailbox,
        onLinkClick(_url, messageId) {
          const message = phishingById.get(messageId);
          if (!message) return;
          activeChat.addMessage({
            type: 'system',
            text: `Warnzeichen: ${message.warningSigns.join(' · ')}`
          }, true);
        }
      });
      chatContainer.querySelector('.chat-back').setAttribute('aria-label', 'Zurück zu den Persona-Details');
      chatContainer.querySelector('.chat-input').focus();
    });

    chatOverlay.addEventListener('click', (event) => {
      if (event.target === chatOverlay) closeMailbox();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMailbox();
    });

  } catch (error) {
    detailCard.innerHTML = `<p class="empty-state">Details konnten nicht geladen werden: ${escapeHtml(error.message || 'Unbekannter Fehler')}</p>`;
  }
}

function attachImageFallbacks(container) {
  container.querySelectorAll('.persona-image').forEach((image) => {
    image.addEventListener('error', () => {
      image.hidden = true;
      image.nextElementSibling.hidden = false;
    }, { once: true });

    if (image.complete && image.naturalWidth === 0) {
      image.dispatchEvent(new Event('error'));
    }
  });
}

async function loadPassStateForDisplay() {
  const status = document.getElementById('status');
  if (!status) {
    return;
  }

  freigabenData = null;
  freigabenError = null;
  try {
    const result = await loadFreshPassData();
    if (!result.ok) {
      freigabenError = result.message;
      status.textContent = result.message;
      status.className = 'status-bar error';
      return;
    }

    freigabenData = result.data;
    const source = result.savedAt
      ? `Datensammelpässe vom ${formatSavedAt(result.savedAt)} geladen`
      : 'Noch kein Datensammelpass hochgeladen';
    if (!result.savedAt) {
      status.textContent = source;
      status.className = 'status-bar status-empty';
    } else if (result.warning) {
      status.textContent = `${source} – einige Einträge sind ungültig oder fehlen.`;
      status.className = 'status-bar warning';
    } else {
      status.textContent = source;
      status.className = 'status-bar active';
    }
  } catch (error) {
    freigabenError = error && error.message ? error.message : 'Datensammelpass konnte nicht geladen werden.';
    status.textContent = 'Kein Datensammelpass gefunden';
    status.className = 'status-bar status-empty';
  }
}

async function initPage() {
  await loadPassStateForDisplay();

  if (document.body.dataset.page === 'overview') {
    // Nachrichtenton braucht eine Nutzerinteraktion, bevor er abgespielt werden darf
    document.addEventListener('pointerdown', preparePersonaAudio, { once: true });
    renderOverviewPage({ animateCounts: consumeNewPassAnimation() });

    // Upload in einem anderen Tab: Übersicht direkt aktualisieren
    window.addEventListener('storage', async (event) => {
      if (event.key !== STORED_PASS_KEY) return;
      await loadPassStateForDisplay();
      renderOverviewPage({ animateCounts: consumeNewPassAnimation() });
    });
  }

  if (document.body.dataset.page === 'upload') {
    renderUploadPage();
  }

  if (document.body.dataset.page === 'detail') {
    renderDetailPage();
  }
}

initPage();
