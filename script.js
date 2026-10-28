const STORAGE_KEY = 'datensammelpass-visibility';
const iconPool = ['🧑‍🎓', '🧑‍💻', '👩‍🏫', '🧑‍🚀', '👩‍🎤', '🧑‍⚕️', '🧑‍🌾', '🧑‍🏫', '👩‍💼', '🧑‍🎨'];

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
  return String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSharedFeatureCount(passData, personaName) {
  const normalizedPersona = normalizePersonName(personaName);
  const personaFlags = passData?.[normalizedPersona] || {};
  return Object.values(personaFlags).filter(Boolean).length;
}

async function readPhishingTemplates() {
  const response = await fetch('phishing_vorlagen.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('phishing_vorlagen.json konnte nicht geladen werden.');
  }
  return response.json();
}

function savePassData(data) {
  const normalized = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    normalized[normalizePersonName(key)] = value;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

function loadPassData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

async function readCsvFile() {
  const response = await fetch('personas.csv', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Personas.csv konnte nicht geladen werden.');
  }
  return parseCsv(await response.text());
}

async function readPassJsonFile() {
  const response = await fetch('freigaben.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('freigaben.json konnte nicht geladen werden.');
  }
  return response.json();
}

function normalizePassData(rawPassData, csvData) {
  const csvFeatures = (csvData.headers || []).slice(1).map((header) => String(header || '').trim()).filter(Boolean);
  const csvFeatureSet = new Set(csvFeatures.map((feature) => normalizeFeatureName(feature)));
  const csvPersonNames = (csvData.rows || [])
    .map((row) => String(row[csvData.headers[0]] || '').trim())
    .filter(Boolean);
  const csvPersonSet = new Set(csvPersonNames.map((name) => normalizePersonName(name)));

  if (!rawPassData || typeof rawPassData !== 'object') {
    throw new Error('Datensammelpass ist ungültig.');
  }

  const source = rawPassData.personas && typeof rawPassData.personas === 'object'
    ? rawPassData.personas
    : rawPassData;

  const passPersonEntries = Object.entries(source || {});
  const normalizedPersonas = {};

  for (const [rawName, rawValue] of passPersonEntries) {
    const canonicalName = normalizePersonName(rawName);
    if (!canonicalName || !rawValue || typeof rawValue !== 'object') {
      continue;
    }

    const normalizedEntry = {};
    for (const feature of csvFeatures) {
      const canonicalFeature = normalizeFeatureName(feature);
      const candidate = rawValue[feature] ?? rawValue[canonicalFeature] ?? rawValue[feature.toLowerCase()] ?? rawValue[feature.replace(/:/g, '')];
      normalizedEntry[canonicalFeature] = Boolean(candidate);
    }
    normalizedPersonas[canonicalName] = normalizedEntry;
  }

  const passFeatures = new Set(
    Object.values(normalizedPersonas)
      .flatMap((entry) => Object.keys(entry || {}))
  );

  const missingFeatures = [...csvFeatureSet].filter((feature) => !passFeatures.has(feature));
  const extraFeatures = [...passFeatures].filter((feature) => !csvFeatureSet.has(feature));
  const missingPersons = [...csvPersonSet].filter((person) => !Object.prototype.hasOwnProperty.call(normalizedPersonas, person));
  const extraPersons = [...Object.keys(normalizedPersonas)].filter((person) => !csvPersonSet.has(person));

  return {
    normalizedPersonas,
    missingFeatures,
    extraFeatures,
    missingPersons,
    extraPersons
  };
}

function buildMismatchMessage(mismatch) {
  const parts = ['Datensammelpass und CSV passen nicht zusammen.'];

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

  return parts.join(' ');
}

async function loadFreshPassData() {
  try {
    const csvData = await readCsvFile();
    const rawPassData = await readPassJsonFile();
    const normalized = normalizePassData(rawPassData, csvData);

    if (
      normalized.missingFeatures.length ||
      normalized.extraFeatures.length ||
      normalized.missingPersons.length ||
      normalized.extraPersons.length
    ) {
      return {
        ok: false,
        message: buildMismatchMessage(normalized),
        mismatch: normalized
      };
    }

    return { ok: true, data: normalized.normalizedPersonas };
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

async function renderOverviewPage() {
  const list = document.getElementById('persona-list');
  if (!list) return;

  try {
    const csvData = await readCsvFile();
    const passData = loadPassData();
    const rows = csvData.rows || [];
    list.innerHTML = rows
      .map((row, index) => {
        const name = row[csvData.headers[0]] || 'Unbekannt';
        const count = getSharedFeatureCount(passData, name);
        const badge = count > 0
          ? `<span class="phishing-badge badge-${count > 2 ? 'high' : count > 0 ? 'medium' : ''}" aria-label="${count} Phishing-Nachricht${count === 1 ? '' : 'en'}" title="${count} Phishing-Nachricht${count === 1 ? '' : 'en'}">${count}</span>`
          : '';

        return `
          <button class="persona-card" type="button" data-name="${escapeHtml(name)}">
            ${badge}
            <span class="persona-icon">${iconPool[index % iconPool.length]}</span>
            <span class="persona-name">${escapeHtml(name)}</span>
          </button>
        `;
      })
      .join('');

    list.querySelectorAll('.persona-card').forEach((button) => {
      button.addEventListener('click', () => {
        const name = button.dataset.name;
        window.location.href = `detail.html?name=${encodeURIComponent(name)}#so-koennten-betrueger-deine-daten-nutzen`;
      });
    });
  } catch (error) {
    list.innerHTML = '<p class="empty-state">Personas konnten nicht geladen werden.</p>';
  }
}

async function renderDetailPage() {
  const detailCard = document.getElementById('detail-card');
  if (!detailCard) return;

  const params = new URLSearchParams(window.location.search);
  const selectedName = params.get('name');

  try {
    const csvData = await readCsvFile();
    const personaRow = (csvData.rows || []).find(
      (row) => String(row[csvData.headers[0]] || '').trim() === selectedName
    );

    if (!personaRow) {
      detailCard.innerHTML = '<p class="empty-state">Diese Persona wurde nicht gefunden.</p>';
      return;
    }

    const passData = loadPassData();
    const canonicalSelectedName = normalizePersonName(selectedName);
    const featureEntries = (csvData.headers || []).slice(1).map((feature) => {
      const canonicalFeature = normalizeFeatureName(feature);
      const rawValue = String(personaRow[feature] || '').trim();
      const isShared = Boolean(passData[canonicalSelectedName]?.[canonicalFeature]);
      return {
        feature,
        displayValue: isShared ? rawValue : 'nicht öffentlich',
        className: isShared ? '' : 'private',
        sharedValue: isShared ? rawValue : null
      };
    });

    const sharedFeatures = featureEntries.filter((entry) => entry.sharedValue !== null);
    const privateCount = featureEntries.length - sharedFeatures.length;

    const phishingTemplates = await readPhishingTemplates();
    const phishingMessages = sharedFeatures
      .map((entry, index) => {
        const template = phishingTemplates[entry.feature];
        if (!template) {
          return null;
        }

        const text = template.text
          .replace(/\{name\}/g, selectedName)
          .replace(/\{wert\}/g, entry.sharedValue);
        const sender = template.sender.includes('{wert}')
          ? template.sender.replace(/\{wert\}/g, entry.sharedValue)
          : template.sender;

        return {
          id: `phishing-${index}`,
          type: 'incoming',
          sender,
          text: `${text}\nhttps://gewinn-link.example`,
          time: new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
          warningSigns: template.warning_signs || []
        };
      })
      .filter(Boolean);

    const icon = iconPool[Math.abs((selectedName || '').length) % iconPool.length];

    detailCard.innerHTML = `
      <div class="detail-header-box">
        <span class="detail-icon">${icon}</span>
        <h2 class="detail-name">${escapeHtml(selectedName)}</h2>
      </div>
      <section class="persona-dashboard" aria-label="Übersicht veröffentlichter Informationen">
        <div class="dashboard-stat dashboard-stat-shared">
          <span class="dashboard-stat-value">${sharedFeatures.length}</span>
          <span class="dashboard-stat-label">Veröffentlichte Informationen</span>
        </div>
        <div class="dashboard-stat dashboard-stat-private">
          <span class="dashboard-stat-value">${privateCount}</span>
          <span class="dashboard-stat-label">Nicht veröffentlichte Informationen</span>
        </div>
        <button
          class="dashboard-mailbox"
          type="button"
          aria-label="Postfach mit ${sharedFeatures.length} ${sharedFeatures.length === 1 ? 'Nachricht' : 'Nachrichten'}"
        >
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M6 9h36v30H6z" />
            <path d="M6 25h10l4 7h8l4-7h10" />
          </svg>
          <span class="dashboard-mailbox-count">${sharedFeatures.length}</span>
          <span class="dashboard-stat-label">${sharedFeatures.length === 1 ? 'Nachricht' : 'Nachrichten'}</span>
        </button>
      </section>
      <details class="feature-disclosure">
        <summary>Merkmale anzeigen</summary>
        <ul class="detail-list">
          ${featureEntries
            .map(
              ({ feature, displayValue, className }) => `
                <li class="detail-item ${className}">
                  <span class="detail-label">${escapeHtml(feature)}</span>
                  <span class="detail-value">${escapeHtml(displayValue)}</span>
                </li>
              `
            )
            .join('')}
        </ul>
      </details>
    `;

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
    detailCard.innerHTML = '<p class="empty-state">Details konnten nicht geladen werden.</p>';
  }
}

async function loadPassStateForDisplay() {
  const status = document.getElementById('status');
  if (!status) {
    return;
  }

  try {
    const result = await loadFreshPassData();
    if (!result.ok) {
      status.textContent = result.message;
      status.className = 'status-bar error';
      return;
    }

    savePassData(result.data);
    status.textContent = 'Datensammelpass geladen';
    status.className = 'status-bar active';
  } catch (error) {
    status.textContent = 'Kein Datensammelpass gefunden';
    status.className = 'status-bar status-empty';
  }
}

async function initPage() {
  await loadPassStateForDisplay();

  if (document.body.dataset.page === 'overview') {
    renderOverviewPage();
  }

  if (document.body.dataset.page === 'detail') {
    renderDetailPage();
  }
}

initPage();
