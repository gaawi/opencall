/* ADAR Composer in Residence — review app */

const STORAGE_KEY = 'adar_composer_review_v2';
const MAX_LISTEN_SEC = 120;

const state = {
  composers: [],       // [{id, name, samples:[{audio_url, pdf_url, note}], extra_pdfs:[], raw}]
  evaluations: {},     // { composerId: [{verdict, ts, listenedSec, attempt}] }
  mode: 'normal',      // 'normal' | 'maybe'
  currentId: null,
  currentSampleIdx: 0,
  filter: 'all',
  pendingMapping: null,
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheEls();
  loadFromStorage();
  bindEvents();
  refreshHome();
  renderResults();
  showScreen('home');
  if (!state.composers.length) tryAutoLoadServerCsv();
}

const AUTO_CSV_PATH = 'submissions.csv';

async function tryAutoLoadServerCsv() {
  try {
    els.homeStatus.textContent = 'Buscando candidatos en el servidor…';
    const res = await fetch(AUTO_CSV_PATH, { cache: 'no-store' });
    if (!res.ok) throw new Error('no server csv');
    const text = await res.text();
    if (!text.trim()) throw new Error('empty csv');
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const fields = parsed.meta.fields || Object.keys(parsed.data[0] || {});
    if (!parsed.data.length) throw new Error('no rows');
    autoImport(parsed.data, fields);
  } catch (e) {
    els.homeStatus.textContent = 'Carga un archivo CSV o Excel para empezar.';
  }
}

function autoImport(rows, fields) {
  const guess = guessNameColumns(fields);
  const composers = [];
  const seen = new Set();
  rows.forEach((r, i) => {
    const a = String(r[guess.name1] || '').trim();
    const b = guess.name2 ? String(r[guess.name2] || '').trim() : '';
    const name = (a + (b ? ' ' + b : '')).trim() || `Anónimo ${i + 1}`;
    const { samples, extraPdfs } = detectSamples(r, fields);
    if (!samples.length) return;
    const subId = String(r['Submission ID'] || r['submission id'] || '').trim();
    const id = subId ? 'sub_' + subId : stableId(name, samples[0].audio_url, i);
    if (seen.has(id)) return;
    seen.add(id);
    composers.push({ id, name, samples, extra_pdfs: extraPdfs, raw: r });
  });
  if (!composers.length) {
    els.homeStatus.textContent = 'Carga un archivo CSV o Excel para empezar.';
    return;
  }
  state.composers = composers;
  saveToStorage();
  refreshHome();
  renderResults();
}

function cacheEls() {
  els.fileInput = document.getElementById('file-input');
  els.columnMapping = document.getElementById('column-mapping');
  els.mapName1 = document.getElementById('map-name1');
  els.mapName2 = document.getElementById('map-name2');
  els.mapSwap = document.getElementById('map-swap');
  els.mappingInfo = document.getElementById('mapping-info');
  els.mappingPreview = document.getElementById('mapping-preview');
  els.confirmMapping = document.getElementById('confirm-mapping');

  els.homeStatus = document.getElementById('home-status');
  els.homeActions = document.getElementById('home-actions');
  els.counters = document.getElementById('counters');
  els.startReview = document.getElementById('start-review');
  els.startMaybes = document.getElementById('start-maybes');
  els.reloadServer = document.getElementById('reload-server');
  els.exportProgress = document.getElementById('export-progress');
  els.importProgress = document.getElementById('import-progress');
  els.resetProgress = document.getElementById('reset-progress');

  els.reviewProgress = document.getElementById('review-progress');
  els.reviewMode = document.getElementById('review-mode');
  els.anonId = document.getElementById('anon-id');
  els.audio = document.getElementById('audio-el');
  els.audioLoading = document.getElementById('audio-loading');
  els.playBtn = document.getElementById('play-btn');
  els.progressBar = document.getElementById('progress-bar');
  els.progressFill = document.getElementById('progress-fill');
  els.progressThumb = document.getElementById('progress-thumb');
  els.timeElapsed = document.getElementById('time-elapsed');
  els.timeTotal = document.getElementById('time-total');
  els.seekBack = document.getElementById('seek-back');
  els.seekFwd = document.getElementById('seek-fwd');
  els.sampleNote = document.getElementById('sample-note');
  els.timer = document.getElementById('timer');
  els.sampleSwitch = document.getElementById('sample-switch');
  els.skipNext = document.getElementById('skip-next');
  els.openPdf = document.getElementById('open-pdf');
  els.reviewEmpty = document.getElementById('review-empty');

  els.totals = document.getElementById('totals');
  els.resultsBody = document.querySelector('#results-table tbody');
  els.exportJson = document.getElementById('export-json');
  els.exportCsv = document.getElementById('export-csv');

  els.finalistsList = document.getElementById('finalists-list');
  els.finalistsSummary = document.getElementById('finalists-summary');
  els.finalistsEmpty = document.getElementById('finalists-empty');
}

function bindEvents() {
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.go)));

  els.fileInput.addEventListener('change', onFilePicked);
  els.confirmMapping.addEventListener('click', confirmMapping);
  els.mapName1.addEventListener('change', updateMappingPreview);
  els.mapName2.addEventListener('change', updateMappingPreview);
  els.mapSwap.addEventListener('change', updateMappingPreview);

  els.startReview.addEventListener('click', () => startReview('normal'));
  els.startMaybes.addEventListener('click', () => startReview('maybe'));
  els.reloadServer.addEventListener('click', () => {
    if (!confirm('Recargar la lista desde el CSV del servidor. Las evaluaciones se conservan. ¿Continuar?')) return;
    tryAutoLoadServerCsv();
  });
  els.exportProgress.addEventListener('click', exportProgress);
  els.importProgress.addEventListener('change', importProgress);
  els.resetProgress.addEventListener('click', resetProgress);

  document.querySelectorAll('.verdict .btn').forEach(b =>
    b.addEventListener('click', () => recordVerdict(b.dataset.verdict)));
  els.skipNext.addEventListener('click', nextComposer);
  els.openPdf.addEventListener('click', openCurrentPdf);

  els.audio.addEventListener('canplaythrough', () => els.audioLoading.classList.add('hidden'));
  els.audio.addEventListener('canplay', () => els.audioLoading.classList.add('hidden'));
  els.audio.addEventListener('loadedmetadata', onLoadedMetadata);
  els.audio.addEventListener('durationchange', onLoadedMetadata);
  els.audio.addEventListener('waiting', () => els.audioLoading.classList.remove('hidden'));
  els.audio.addEventListener('playing', () => els.audioLoading.classList.add('hidden'));
  els.audio.addEventListener('timeupdate', onAudioTime);
  els.audio.addEventListener('play', onAudioPlay);
  els.audio.addEventListener('pause', onAudioPause);
  els.audio.addEventListener('ended', () => { accumulateListen(); setPlayingUi(false); });

  els.playBtn.addEventListener('click', togglePlay);
  els.seekBack.addEventListener('click', () => seekRelative(-10));
  els.seekFwd.addEventListener('click', () => seekRelative(10));
  setupScrubber();

  document.querySelectorAll('[data-filter]').forEach(b =>
    b.addEventListener('click', () => { state.filter = b.dataset.filter; renderResults(); }));

  document.querySelectorAll('[data-fin-filter]').forEach(b =>
    b.addEventListener('click', () => { state.finalistsFilter = b.dataset.finFilter; renderFinalists(); }));

  els.exportJson.addEventListener('click', exportResultsJson);
  els.exportCsv.addEventListener('click', exportResultsCsv);
}

/* ---------- Storage ---------- */

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    composers: state.composers,
    evaluations: state.evaluations,
  }));
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.composers = data.composers || [];
    state.evaluations = data.evaluations || {};
  } catch (e) {
    console.warn('No se pudo leer el progreso guardado:', e);
  }
}

/* ---------- Importing ---------- */

function onFilePicked(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') readCsv(file);
  else if (ext === 'xlsx' || ext === 'xls') readExcel(file);
  else alert('Formato no soportado. Usa CSV o Excel.');
}

function readCsv(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: ({ data, meta }) => prepareMapping(data, meta.fields || Object.keys(data[0] || {})),
    error: err => alert('Error leyendo CSV: ' + err.message),
  });
}

function readExcel(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const fields = rows.length ? Object.keys(rows[0]) : [];
    prepareMapping(rows, fields);
  };
  reader.onerror = () => alert('Error leyendo el archivo Excel.');
  reader.readAsArrayBuffer(file);
}

function prepareMapping(rows, fields) {
  if (!rows || !rows.length) { alert('El archivo está vacío.'); return; }
  state.pendingMapping = { rows, fields };

  const guess = guessNameColumns(fields);
  fillSelect(els.mapName1, fields, guess.name1, false);
  fillSelect(els.mapName2, ['(ninguna)'].concat(fields), guess.name2 || '(ninguna)', false);
  els.mapSwap.checked = false;

  const audioCount = countDetectedKind(rows, isAudioUrl);
  const pdfCount = countDetectedKind(rows, isPdfUrl);
  els.mappingInfo.innerHTML =
    `Detectados <b>${rows.length}</b> filas con <b>${audioCount}</b> audios y <b>${pdfCount}</b> PDFs en total. ` +
    `Selecciona qué columnas forman el nombre.`;

  els.columnMapping.classList.remove('hidden');
  els.homeStatus.textContent = `Detectadas ${rows.length} filas. Confirma el nombre.`;
  updateMappingPreview();
}

function guessNameColumns(fields) {
  const lower = fields.map(f => String(f).toLowerCase().trim());
  function find(candidates, exclude = []) {
    for (const p of candidates) {
      const i = lower.findIndex((h, idx) => h.includes(p) && !exclude.includes(fields[idx]));
      if (i !== -1) return fields[i];
    }
    return null;
  }
  // The ADAR Tally form has first name in "Read the guidelines" by accident;
  // try a sensible default but let the user override.
  const first = find(['first name', 'nombre', 'name'])
    || find(['read the guidelines'])
    || fields[0];
  const last = find(['last name', 'apellido', 'surname'], [first]);
  return { name1: first, name2: last };
}

function fillSelect(sel, options, selected, includeNone) {
  sel.innerHTML = '';
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    if (o === selected) opt.selected = true;
    sel.appendChild(opt);
  }
}

function updateMappingPreview() {
  const { rows } = state.pendingMapping;
  const sample = rows.slice(0, 3).map(r => buildNameFromMapping(r));
  els.mappingPreview.innerHTML = sample.length
    ? 'Ejemplo: <b>' + sample.map(escapeHtml).join('</b>, <b>') + '</b>'
    : '';
}

function buildNameFromMapping(row) {
  const n1 = els.mapName1.value;
  const n2 = els.mapName2.value;
  const a = String(row[n1] || '').trim();
  const b = n2 && n2 !== '(ninguna)' ? String(row[n2] || '').trim() : '';
  if (!a && !b) return '';
  if (!b) return a;
  return els.mapSwap.checked ? `${b}, ${a}` : `${a} ${b}`;
}

function countDetectedKind(rows, predicate) {
  let n = 0;
  for (const r of rows) for (const v of Object.values(r)) if (predicate(v)) n++;
  return n;
}

function isUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
}
function isAudioUrl(s) {
  if (!isUrl(s)) return false;
  return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i.test(s);
}
function isPdfUrl(s) {
  if (!isUrl(s)) return false;
  return /\.pdf(\?|#|$)/i.test(s);
}
function isShortNote(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  return t.length > 0 && t.length < 80 && !isUrl(t);
}

function detectSamples(row, fields) {
  // Walk through the row columns in order. Each time we find an audio URL,
  // we pair it with the nearest preceding PDF URL (within ~3 columns) and
  // the nearest following short note (the bar/minute hint).
  const audios = [];
  const pdfs = [];
  for (const f of fields) {
    const v = row[f];
    if (isAudioUrl(v)) audios.push({ field: f, url: v.trim() });
    else if (isPdfUrl(v)) pdfs.push({ field: f, url: v.trim() });
  }

  const samples = [];
  const usedPdfFields = new Set();
  for (const a of audios) {
    const idxA = fields.indexOf(a.field);
    // Find closest PDF before this audio, not yet used
    let bestPdf = null, bestDist = Infinity;
    for (const p of pdfs) {
      if (usedPdfFields.has(p.field)) continue;
      const idxP = fields.indexOf(p.field);
      if (idxP > idxA) continue;
      const d = idxA - idxP;
      if (d < bestDist) { bestDist = d; bestPdf = p; }
    }
    if (bestPdf) usedPdfFields.add(bestPdf.field);

    // Look for a short note in the next 1-2 columns after the audio
    let note = '';
    for (let k = 1; k <= 2; k++) {
      const f2 = fields[idxA + k];
      if (!f2) break;
      const v2 = row[f2];
      if (isShortNote(v2)) { note = String(v2).trim(); break; }
    }
    samples.push({
      audio_url: a.url,
      pdf_url: bestPdf ? bestPdf.url : '',
      note,
    });
  }
  // Any leftover PDFs (no audio match) become extras
  const extraPdfs = pdfs.filter(p => !usedPdfFields.has(p.field)).map(p => p.url);
  return { samples, extraPdfs };
}

function confirmMapping() {
  const { rows, fields } = state.pendingMapping;
  const seen = new Set();
  const composers = [];

  rows.forEach((r, i) => {
    const name = buildNameFromMapping(r) || `Anónimo ${i + 1}`;
    const { samples, extraPdfs } = detectSamples(r, fields);
    if (!samples.length) return; // skip rows without any audio
    const subId = String(r['Submission ID'] || r['submission id'] || '').trim();
    const id = subId ? 'sub_' + subId : stableId(name, samples[0].audio_url, i);
    if (seen.has(id)) return;
    seen.add(id);
    composers.push({
      id,
      name,
      samples,
      extra_pdfs: extraPdfs,
      raw: r,
    });
  });

  if (!composers.length) {
    alert('No se han detectado audios en este archivo. Comprueba que las columnas contienen URLs a archivos .mp3.');
    return;
  }

  state.composers = composers;
  state.pendingMapping = null;
  els.columnMapping.classList.add('hidden');
  els.fileInput.value = '';
  saveToStorage();
  refreshHome();
  renderResults();
}

function stableId(name, audio, idx) {
  const base = (String(name || '') + '|' + String(audio || '') + '|' + idx).toLowerCase();
  let h = 0;
  for (let i = 0; i < base.length; i++) h = ((h << 5) - h + base.charCodeAt(i)) | 0;
  return 'c_' + (h >>> 0).toString(36);
}

/* ---------- Home ---------- */

function refreshHome() {
  const n = state.composers.length;
  if (!n) {
    els.homeActions.classList.add('hidden');
    els.homeStatus.textContent = 'Carga un archivo CSV o Excel para empezar.';
    return;
  }
  els.homeActions.classList.remove('hidden');
  const status = computeStatusCounts();
  els.homeStatus.textContent = `${n} candidatos cargados.`;
  els.counters.innerHTML = `
    <div class="cell"><div class="v">${n}</div><div class="l">Total</div></div>
    <div class="cell"><div class="v">${status.pending}</div><div class="l">Sin revisar</div></div>
    <div class="cell"><div class="v">${status.yes}</div><div class="l">Sí</div></div>
    <div class="cell"><div class="v">${status.maybe}</div><div class="l">Maybe</div></div>
  `;
}

function computeStatusCounts() {
  const counts = { yes: 0, no: 0, maybe: 0, pending: 0 };
  for (const c of state.composers) {
    const s = currentStatus(c.id);
    if (!s) counts.pending++; else counts[s]++;
  }
  return counts;
}

function currentStatus(id) {
  const list = state.evaluations[id];
  if (!list || !list.length) return null;
  return list[list.length - 1].verdict;
}

function reviewCount(id) {
  const list = state.evaluations[id];
  return list ? list.length : 0;
}

function totalListened(id) {
  const list = state.evaluations[id] || [];
  return list.reduce((sum, e) => sum + (e.listenedSec || 0), 0);
}

/* ---------- Review flow ---------- */

const listening = { startedAt: 0, accumulated: 0 };

function startReview(mode) {
  state.mode = mode;
  els.reviewMode.textContent = mode === 'maybe' ? 'Modo: revisar maybes' : 'Modo: normal';
  showScreen('review');
  nextComposer();
}

function pickNextComposer() {
  let pool;
  if (state.mode === 'maybe') {
    pool = state.composers.filter(c => currentStatus(c.id) === 'maybe');
  } else {
    pool = state.composers.filter(c => currentStatus(c.id) == null);
  }
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function nextComposer() {
  resetListening();
  const c = pickNextComposer();
  if (!c) {
    state.currentId = null;
    showEmptyReview();
    return;
  }
  state.currentId = c.id;
  state.currentSampleIdx = 0;
  els.reviewEmpty.classList.add('hidden');
  els.anonId.textContent = '#' + c.id.replace(/^c_|^sub_/, '').toUpperCase().slice(0, 8);
  updateProgress();
  renderSampleSwitch();
  loadSample(0);
}

function currentComposer() {
  return state.composers.find(x => x.id === state.currentId) || null;
}

function renderSampleSwitch() {
  const c = currentComposer();
  els.sampleSwitch.innerHTML = '';
  if (!c || c.samples.length <= 1) {
    els.sampleSwitch.classList.add('hidden');
    return;
  }
  els.sampleSwitch.classList.remove('hidden');
  c.samples.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'btn pill-btn' + (i === state.currentSampleIdx ? ' active' : '');
    b.textContent = `Muestra ${i + 1}`;
    b.addEventListener('click', () => loadSample(i));
    els.sampleSwitch.appendChild(b);
  });
}

function loadSample(idx) {
  const c = currentComposer();
  if (!c) return;
  if (idx < 0 || idx >= c.samples.length) return;
  // Save any in-progress listen time before switching
  accumulateListen();
  state.currentSampleIdx = idx;
  renderSampleSwitch();
  const s = c.samples[idx];
  els.sampleNote.textContent = s.note ? `Indicación del autor: ${s.note}` : '';
  loadAudio(s.audio_url);
}

let _lastBlobUrl = null;

async function loadAudio(url) {
  els.audio.pause();
  setPlayingUi(false);
  els.audioLoading.textContent = 'Cargando audio…';
  els.audioLoading.classList.remove('hidden');
  els.timeElapsed.textContent = '0:00';
  els.timeTotal.textContent = '--:--';
  els.progressFill.style.width = '0%';
  els.progressThumb.style.left = '0%';
  if (_lastBlobUrl) { URL.revokeObjectURL(_lastBlobUrl); _lastBlobUrl = null; }
  els.audio.removeAttribute('src');
  els.audio.load();
  updateTimerDisplay();

  // iOS WebKit shows "Live Broadcast" and disables scrubbing when the server
  // doesn't expose Content-Length. Fetching as a Blob gives the element a
  // fully-known resource so the scrubber works. Falls back to direct URL if
  // CORS blocks the fetch.
  const loadId = ++loadAudio._token;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    if (loadId !== loadAudio._token) return; // superseded
    _lastBlobUrl = URL.createObjectURL(blob);
    els.audio.src = _lastBlobUrl;
    els.audio.load();
  } catch (e) {
    if (loadId !== loadAudio._token) return;
    console.warn('Blob fetch falló, uso URL directa:', e);
    els.audio.src = url;
    els.audio.load();
  }
}
loadAudio._token = 0;

function seekRelative(delta) {
  if (!isFinite(els.audio.duration) || els.audio.duration <= 0) return;
  const t = Math.min(Math.max(0, els.audio.currentTime + delta), els.audio.duration);
  els.audio.currentTime = t;
  updateProgressUi();
}

function togglePlay() {
  if (els.audio.paused) {
    els.audio.play().catch(err => console.warn('play() bloqueado:', err));
  } else {
    els.audio.pause();
  }
}

function onAudioPause() {
  accumulateListen();
  setPlayingUi(false);
}

function setPlayingUi(playing) {
  els.playBtn.classList.toggle('playing', playing);
  els.playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
}

function onLoadedMetadata() {
  const d = els.audio.duration;
  els.timeTotal.textContent = isFinite(d) && d > 0 ? formatSec(d) : '--:--';
  updateProgressUi();
  els.audioLoading.classList.add('hidden');
}

function updateProgressUi() {
  const d = els.audio.duration;
  const t = els.audio.currentTime || 0;
  const ratio = (isFinite(d) && d > 0) ? Math.min(1, Math.max(0, t / d)) : 0;
  const pct = (ratio * 100).toFixed(2) + '%';
  els.progressFill.style.width = pct;
  els.progressThumb.style.left = pct;
  els.progressBar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  els.timeElapsed.textContent = formatSec(t);
}

function setupScrubber() {
  const bar = els.progressBar;
  let dragging = false;
  let wasPlaying = false;

  function ratioFromEvent(e) {
    const rect = bar.getBoundingClientRect();
    const clientX = e.clientX != null ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function seekTo(ratio) {
    const d = els.audio.duration;
    if (!isFinite(d) || d <= 0) return;
    els.audio.currentTime = ratio * d;
    updateProgressUi();
  }

  bar.addEventListener('pointerdown', e => {
    if (!isFinite(els.audio.duration) || els.audio.duration <= 0) return;
    dragging = true;
    wasPlaying = !els.audio.paused;
    if (wasPlaying) els.audio.pause();
    bar.setPointerCapture(e.pointerId);
    seekTo(ratioFromEvent(e));
    e.preventDefault();
  });
  bar.addEventListener('pointermove', e => {
    if (!dragging) return;
    seekTo(ratioFromEvent(e));
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (wasPlaying) els.audio.play().catch(() => {});
  }
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
}

function updateProgress() {
  let total, current;
  if (state.mode === 'maybe') {
    const initialMaybes = state.composers.filter(c => (state.evaluations[c.id] || []).some(e => e.verdict === 'maybe')).length;
    const pendingMaybes = state.composers.filter(c => currentStatus(c.id) === 'maybe').length;
    total = initialMaybes;
    current = total - pendingMaybes + 1;
  } else {
    total = state.composers.length;
    current = state.composers.filter(c => currentStatus(c.id)).length + 1;
  }
  els.reviewProgress.textContent = `Audio ${Math.min(current, total)} de ${total}`;
}

function showEmptyReview() {
  els.reviewEmpty.classList.remove('hidden');
  els.audio.pause();
  setPlayingUi(false);
  els.audio.removeAttribute('src');
  els.audio.load();
  els.timer.textContent = '–';
  els.anonId.textContent = '#–';
  els.audioLoading.classList.add('hidden');
  els.sampleSwitch.classList.add('hidden');
  els.sampleNote.textContent = '';
  els.timeElapsed.textContent = '0:00';
  els.timeTotal.textContent = '--:--';
  els.progressFill.style.width = '0%';
  els.progressThumb.style.left = '0%';
}

function resetListening() {
  listening.startedAt = 0;
  listening.accumulated = 0;
}

function onAudioPlay() {
  if (currentListenedSec() >= MAX_LISTEN_SEC) {
    els.audio.pause();
    return;
  }
  listening.startedAt = performance.now();
  setPlayingUi(true);
}

function accumulateListen() {
  if (listening.startedAt) {
    listening.accumulated += (performance.now() - listening.startedAt) / 1000;
    listening.startedAt = 0;
  }
}

function currentListenedSec() {
  let total = listening.accumulated;
  if (listening.startedAt) total += (performance.now() - listening.startedAt) / 1000;
  return total;
}

function onAudioTime() {
  updateTimerDisplay();
  updateProgressUi();
  if (currentListenedSec() >= MAX_LISTEN_SEC) {
    els.audio.pause();
    accumulateListen();
  }
}

function updateTimerDisplay() {
  const remaining = Math.max(0, MAX_LISTEN_SEC - currentListenedSec());
  els.timer.textContent = formatSec(remaining);
  els.timer.classList.toggle('warn', remaining < 30 && remaining > 5);
  els.timer.classList.toggle('over', remaining <= 5);
}

function formatSec(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

function recordVerdict(verdict) {
  if (!state.currentId) return;
  els.audio.pause();
  accumulateListen();
  const id = state.currentId;
  const list = state.evaluations[id] || (state.evaluations[id] = []);
  list.push({
    verdict,
    ts: new Date().toISOString(),
    listenedSec: Math.round(currentListenedSec() * 10) / 10,
    attempt: list.length === 0 ? 'first' : 'review',
  });
  saveToStorage();
  refreshHome();
  renderResults();
  nextComposer();
}

function openCurrentPdf() {
  const c = currentComposer();
  if (!c) return;
  const pdfs = c.samples.map(s => s.pdf_url).filter(Boolean).concat(c.extra_pdfs || []);
  if (!pdfs.length) { alert('Este candidato no tiene PDF.'); return; }
  if (pdfs.length === 1) { window.open(pdfs[0], '_blank', 'noopener'); return; }
  // Open the PDF that corresponds to the current sample first, then others
  const current = c.samples[state.currentSampleIdx]?.pdf_url;
  const ordered = current ? [current, ...pdfs.filter(u => u !== current)] : pdfs;
  ordered.forEach(u => window.open(u, '_blank', 'noopener'));
}

/* ---------- Finalists ---------- */

const FINALIST_FIELDS = {
  email:   ['email'],
  phone:   ['phone number', 'phone', 'teléfono'],
  website: ['website', 'web', 'url'],
  type:    ['option ', 'multiple choice', 'tipo'],
  bio:     ['tell us about', 'about yourself', 'bio'],
  why:     ['long answer', 'why', 'por qué', 'porque'],
};

function rawGet(raw, keys) {
  if (!raw) return '';
  for (const target of keys) {
    for (const [k, v] of Object.entries(raw)) {
      if (k.toLowerCase().includes(target) && typeof v === 'string' && v.trim()) {
        return v.trim();
      }
    }
  }
  return '';
}

function renderFinalists() {
  const filter = state.finalistsFilter || 'yes';
  document.querySelectorAll('[data-fin-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.finFilter === filter);
  });

  const list = state.composers
    .map(c => ({ c, status: currentStatus(c.id), reviews: state.evaluations[c.id] || [] }))
    .filter(r => {
      if (filter === 'reviewed') return !!r.status;
      return r.status === filter;
    })
    .sort((a, b) => {
      const at = (a.reviews.slice(-1)[0] || {}).ts || '';
      const bt = (b.reviews.slice(-1)[0] || {}).ts || '';
      return bt.localeCompare(at);
    });

  els.finalistsSummary.textContent =
    `${list.length} candidato${list.length === 1 ? '' : 's'}` +
    (filter === 'yes' ? ' marcado(s) como Sí.' :
     filter === 'maybe' ? ' marcado(s) como Maybe.' :
     ' revisado(s) en total.');

  els.finalistsEmpty.classList.toggle('hidden', list.length > 0);
  els.finalistsList.innerHTML = '';
  list.forEach(({ c, status, reviews }) => {
    els.finalistsList.appendChild(buildFinalistCard(c, status, reviews));
  });
}

function buildFinalistCard(c, status, reviews) {
  const card = document.createElement('div');
  card.className = 'finalist-card';
  card.dataset.composerId = c.id;

  const raw = c.raw || {};
  const email = rawGet(raw, FINALIST_FIELDS.email);
  const phone = rawGet(raw, FINALIST_FIELDS.phone);
  const website = rawGet(raw, FINALIST_FIELDS.website);
  const type = rawGet(raw, FINALIST_FIELDS.type);
  const bio = rawGet(raw, FINALIST_FIELDS.bio);
  const why = rawGet(raw, FINALIST_FIELDS.why);

  const contactRows = [];
  if (email) contactRows.push(`<div><span class="label">Email</span><a href="mailto:${escapeAttr(email)}">${escapeHtml(email)}</a></div>`);
  if (phone) contactRows.push(`<div><span class="label">Tel</span><a href="tel:${escapeAttr(phone.replace(/\s/g, ''))}">${escapeHtml(phone)}</a></div>`);
  if (website) {
    const url = /^https?:/i.test(website) ? website : 'https://' + website.replace(/^\/*/, '');
    contactRows.push(`<div><span class="label">Web</span><a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(website)}</a></div>`);
  }

  const sections = [];
  if (type) sections.push(`<div class="fc-section"><h4>Tipo de residencia</h4><div class="body">${escapeHtml(type)}</div></div>`);
  if (bio) sections.push(`<details class="fc-expand fc-section"><summary>Sobre el compositor</summary><div class="body">${escapeHtml(bio)}</div></details>`);
  if (why) sections.push(`<details class="fc-expand fc-section"><summary>Por qué quiere la residencia</summary><div class="body">${escapeHtml(why)}</div></details>`);

  const historyRows = reviews.slice().reverse().map(e => {
    const when = new Date(e.ts);
    const fmt = isNaN(when) ? e.ts : when.toLocaleString();
    return `<div class="h-row">${statusTag(e.verdict)} <span>${fmt}</span> <span>· ${formatSec(e.listenedSec || 0)} escuchados</span> <span>· ${e.attempt === 'first' ? 'primera' : 'revisión'}</span></div>`;
  }).join('');

  card.innerHTML = `
    <div class="fc-header">
      <h3 class="fc-name">${escapeHtml(c.name)}</h3>
      ${statusTag(status)}
    </div>
    ${contactRows.length ? `<div class="fc-contact">${contactRows.join('')}</div>` : ''}
    ${sections.join('')}
    <div class="fc-player" data-player></div>
    ${reviews.length ? `<div class="fc-section"><h4>Historial</h4><div class="fc-history">${historyRows}</div></div>` : ''}
  `;

  const playerEl = card.querySelector('[data-player]');
  setupFinalistPlayer(playerEl, c);
  return card;
}

function setupFinalistPlayer(container, composer) {
  const samples = composer.samples || [];
  if (!samples.length) {
    container.innerHTML = '<div class="muted small">Sin audios.</div>';
    return;
  }

  const tabs = samples.length > 1
    ? `<div class="fc-sample-tabs">${samples.map((s, i) =>
        `<button type="button" class="tab${i === 0 ? ' active' : ''}" data-i="${i}">Muestra ${i + 1}</button>`).join('')}</div>`
    : '';

  container.innerHTML = `
    ${tabs}
    <div class="fc-sample-note"></div>
    <audio preload="metadata"></audio>
    <div class="fc-player-row">
      <button type="button" class="fc-play-btn" aria-label="Reproducir">
        <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
      </button>
      <div class="fc-progress" role="slider" aria-label="Posición del audio" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="fc-fill"></div>
        <div class="fc-thumb"></div>
      </div>
    </div>
    <div class="fc-time-row"><span class="t elapsed">0:00</span><span class="t total">--:--</span></div>
    <div class="fc-controls">
      <button type="button" class="seek-btn back">−10s</button>
      <button type="button" class="seek-btn fwd">+10s</button>
      <button type="button" class="btn ghost pdf-btn">Ver PDF</button>
    </div>
  `;

  const audio    = container.querySelector('audio');
  const note     = container.querySelector('.fc-sample-note');
  const playBtn  = container.querySelector('.fc-play-btn');
  const bar      = container.querySelector('.fc-progress');
  const fill     = container.querySelector('.fc-fill');
  const thumb    = container.querySelector('.fc-thumb');
  const elapsed  = container.querySelector('.elapsed');
  const total    = container.querySelector('.total');
  const backBtn  = container.querySelector('.back');
  const fwdBtn   = container.querySelector('.fwd');
  const pdfBtn   = container.querySelector('.pdf-btn');
  const tabsBtns = container.querySelectorAll('.fc-sample-tabs .tab');

  let activeIdx = 0;
  let blobUrl = null;
  let loadToken = 0;

  function setActiveTab(i) {
    activeIdx = i;
    tabsBtns.forEach((b, k) => b.classList.toggle('active', k === i));
    note.textContent = samples[i].note ? `Indicación del autor: ${samples[i].note}` : '';
    pdfBtn.disabled = !samples[i].pdf_url && !(composer.extra_pdfs || []).length;
  }

  async function loadSample(i) {
    audio.pause();
    setActiveTab(i);
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    audio.removeAttribute('src'); audio.load();
    elapsed.textContent = '0:00';
    total.textContent = '--:--';
    fill.style.width = '0%';
    thumb.style.left = '0%';
    const url = samples[i].audio_url;
    const myToken = ++loadToken;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('http ' + res.status);
      const blob = await res.blob();
      if (myToken !== loadToken) return;
      blobUrl = URL.createObjectURL(blob);
      audio.src = blobUrl;
      audio.load();
    } catch (e) {
      if (myToken !== loadToken) return;
      audio.src = url;
      audio.load();
    }
  }

  audio.addEventListener('loadedmetadata', () => {
    const d = audio.duration;
    total.textContent = isFinite(d) && d > 0 ? formatSec(d) : '--:--';
  });
  audio.addEventListener('durationchange', () => {
    const d = audio.duration;
    total.textContent = isFinite(d) && d > 0 ? formatSec(d) : '--:--';
  });
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration, t = audio.currentTime || 0;
    elapsed.textContent = formatSec(t);
    const ratio = (isFinite(d) && d > 0) ? Math.min(1, Math.max(0, t / d)) : 0;
    const pct = (ratio * 100).toFixed(2) + '%';
    fill.style.width = pct;
    thumb.style.left = pct;
    bar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  });
  audio.addEventListener('play', () => {
    playBtn.classList.add('playing');
    playBtn.setAttribute('aria-label', 'Pausar');
    document.querySelectorAll('audio').forEach(a => { if (a !== audio && !a.paused) a.pause(); });
  });
  audio.addEventListener('pause', () => {
    playBtn.classList.remove('playing');
    playBtn.setAttribute('aria-label', 'Reproducir');
  });
  audio.addEventListener('ended', () => {
    playBtn.classList.remove('playing');
    playBtn.setAttribute('aria-label', 'Reproducir');
  });

  playBtn.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(err => console.warn('play() bloqueado:', err));
    else audio.pause();
  });
  backBtn.addEventListener('click', () => {
    if (isFinite(audio.duration)) audio.currentTime = Math.max(0, audio.currentTime - 10);
  });
  fwdBtn.addEventListener('click', () => {
    if (isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
  });
  pdfBtn.addEventListener('click', () => {
    const s = samples[activeIdx];
    const pdfs = (s.pdf_url ? [s.pdf_url] : []).concat(composer.extra_pdfs || []);
    if (!pdfs.length) { alert('Sin PDF para esta muestra.'); return; }
    pdfs.forEach(u => window.open(u, '_blank', 'noopener'));
  });

  tabsBtns.forEach(b => b.addEventListener('click', () => loadSample(Number(b.dataset.i))));

  // Scrubber
  let dragging = false, wasPlaying = false;
  function ratioFromEvent(e) {
    const rect = bar.getBoundingClientRect();
    const cx = e.clientX != null ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    return Math.min(1, Math.max(0, (cx - rect.left) / rect.width));
  }
  function seekTo(r) {
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = r * audio.duration;
  }
  bar.addEventListener('pointerdown', e => {
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    dragging = true;
    wasPlaying = !audio.paused;
    if (wasPlaying) audio.pause();
    bar.setPointerCapture(e.pointerId);
    seekTo(ratioFromEvent(e));
    e.preventDefault();
  });
  bar.addEventListener('pointermove', e => { if (dragging) seekTo(ratioFromEvent(e)); });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (wasPlaying) audio.play().catch(() => {});
  }
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  setActiveTab(0);
  // Lazy: only fetch when user first clicks play (saves bandwidth on big lists)
  let loaded = false;
  const lazyLoad = () => { if (loaded) return; loaded = true; loadSample(0); };
  playBtn.addEventListener('click', lazyLoad, { once: true });
  bar.addEventListener('pointerdown', lazyLoad, { once: true });

  // If user switches sample before first play, load that sample (and mark loaded so first lazyLoad above won't run again)
  tabsBtns.forEach(b => b.addEventListener('click', () => { loaded = true; }, { once: true }));
}

/* ---------- Results ---------- */

function renderResults() {
  const filter = state.filter || 'all';
  const rows = state.composers
    .map(c => ({
      c,
      status: currentStatus(c.id),
      reviews: reviewCount(c.id),
      listened: totalListened(c.id),
    }))
    .filter(r => {
      if (filter === 'all') return true;
      if (filter === 'pending') return !r.status;
      return r.status === filter;
    });

  const counts = computeStatusCounts();
  els.totals.innerHTML = `
    <span>Total: <b>${state.composers.length}</b></span>
    <span>Sí: <b>${counts.yes}</b></span>
    <span>Maybe: <b>${counts.maybe}</b></span>
    <span>No: <b>${counts.no}</b></span>
    <span>Sin revisar: <b>${counts.pending}</b></span>
  `;

  els.resultsBody.innerHTML = rows.map((r, i) => {
    const audios = r.c.samples.map((s, idx) =>
      `<a href="${escapeAttr(s.audio_url)}" target="_blank" rel="noopener">audio ${idx + 1}</a>`).join(' · ');
    const pdfs = r.c.samples.map((s, idx) => s.pdf_url
      ? `<a href="${escapeAttr(s.pdf_url)}" target="_blank" rel="noopener">PDF ${idx + 1}</a>` : '').filter(Boolean)
      .concat((r.c.extra_pdfs || []).map((u, k) => `<a href="${escapeAttr(u)}" target="_blank" rel="noopener">PDF extra ${k + 1}</a>`))
      .join(' · ');
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.c.name)}</td>
        <td>${statusTag(r.status)}</td>
        <td>${r.reviews}</td>
        <td>${formatSec(r.listened)}</td>
        <td>${audios || '—'}</td>
        <td>${pdfs || '—'}</td>
      </tr>`;
  }).join('');
}

function statusTag(s) {
  if (!s) return '<span class="tag pending">Sin revisar</span>';
  const label = s === 'yes' ? 'Sí' : s === 'maybe' ? 'Maybe' : 'No';
  return `<span class="tag ${s}">${label}</span>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

/* ---------- Export / Import ---------- */

function exportResultsJson() {
  const data = state.composers.map(c => ({
    id: c.id,
    name: c.name,
    samples: c.samples,
    extra_pdfs: c.extra_pdfs || [],
    status: currentStatus(c.id),
    reviews: state.evaluations[c.id] || [],
    total_listened_sec: totalListened(c.id),
  }));
  download('resultados.json', JSON.stringify(data, null, 2), 'application/json');
}

function exportResultsCsv() {
  const rows = state.composers.map(c => {
    const evals = state.evaluations[c.id] || [];
    return {
      id: c.id,
      name: c.name,
      status: currentStatus(c.id) || '',
      reviews: evals.length,
      total_listened_sec: totalListened(c.id),
      last_ts: evals.slice(-1)[0]?.ts || '',
      audio_1: c.samples[0]?.audio_url || '',
      audio_2: c.samples[1]?.audio_url || '',
      pdf_1: c.samples[0]?.pdf_url || '',
      pdf_2: c.samples[1]?.pdf_url || '',
    };
  });
  const csv = Papa.unparse(rows);
  download('resultados.csv', csv, 'text/csv');
}

function exportProgress() {
  const blob = {
    composers: state.composers,
    evaluations: state.evaluations,
    exported_at: new Date().toISOString(),
  };
  download('progreso.json', JSON.stringify(blob, null, 2), 'application/json');
}

function importProgress(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.composers || !data.evaluations) throw new Error('Estructura inválida');
      if (!confirm('Esto sobrescribirá el progreso actual. ¿Continuar?')) return;
      state.composers = data.composers;
      state.evaluations = data.evaluations;
      saveToStorage();
      refreshHome();
      renderResults();
      alert('Progreso importado.');
    } catch (e) {
      alert('Archivo inválido: ' + e.message);
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

function resetProgress() {
  if (!confirm('¿Borrar TODOS los candidatos y evaluaciones? Esta acción no se puede deshacer.')) return;
  state.composers = [];
  state.evaluations = {};
  saveToStorage();
  refreshHome();
  renderResults();
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- Navigation ---------- */

function showScreen(name) {
  for (const id of ['home', 'review', 'results', 'finalists']) {
    document.getElementById('screen-' + id).classList.toggle('hidden', id !== name);
  }
  if (name === 'home') refreshHome();
  if (name === 'results') renderResults();
  if (name === 'finalists') renderFinalists();
  if (name !== 'review') {
    els.audio.pause();
    accumulateListen();
  }
  if (name !== 'finalists') {
    document.querySelectorAll('#finalists-list audio').forEach(a => a.pause());
  }
}
