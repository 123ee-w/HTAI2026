(function () {
  const tinyWebDbUrl = 'https://tinywebdb.appinventor.space/api';
  const tinyWebDbUser = 'tsc123';
  const tinyWebDbSecret = '56f57fef';
  const tags = {
    topic: 'HTAI_TOPIC',
    page: 'HTAI_PAGE',
    mode: 'HTAI_MODE',
    command: 'HTAI_COMMAND',
    keyword: 'HTAI_KEYWORD',
    answer: 'HTAI_ANSWER',
    effect: 'HTAI_EFFECT',
    tts: 'HTAI_TTS',
    question: 'HTAI_QUESTION',
    stats: 'HTAI_QUIZ_STATS',
    legacyTopic: 'current_theme'
  };

  const themeAliases = {
    A: 'A',
    B: 'B',
    P: 'P',
    Y: 'Y',
    T: 'T',
    O: 'O',
    N: 'N',
    ALL: 'ALL',
    QR: 'QR',
    SHENZHOU: 'A',
    TIANGONG: 'B',
    HUOJIAN: 'P',
    ROCKET: 'P',
    TANYUE: 'Y',
    MOON: 'Y',
    TIANWEN: 'T',
    MARS: 'T',
    BEIDOU: 'O',
    FEIJI: 'N',
    C919: 'N',
    HOME: ''
  };

  let networkReady = false;
  let pollTimer = null;
  let pollBusy = false;
  let writeQueue = Promise.resolve();
  let latestStatus = '正在连接 TinyWebDB';
  let lastSnapshot = null;
  let lastTopicCode = '';

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function showToast(text) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  function setStatus(text, connected) {
    latestStatus = text;
    $all('#cloudStatus,#btStatus,[data-cloud-status],[data-bt-status]').forEach((node) => {
      node.textContent = text;
      node.classList.toggle('ok', Boolean(connected));
    });
    $all('[data-send-command], #syncAchievement').forEach((node) => {
      node.disabled = !connected;
    });
  }

  function getThemeCode(fallback = 'A') {
    const params = new URLSearchParams(location.search);
    const requested = (params.get('theme') || localStorage.getItem('htai-theme') || fallback).toUpperCase();
    return window.AppData.themes[requested] ? requested : fallback;
  }

  function setThemeCode(code) {
    if (window.AppData.themes[code]) localStorage.setItem('htai-theme', code);
  }

  function isNetworkReady() {
    return networkReady;
  }

  function parseMaybeJson(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  function unwrapValue(result, tag = '') {
    let value = result;
    if (value && typeof value === 'object') {
      if (tag && Object.prototype.hasOwnProperty.call(value, tag)) {
        value = value[tag];
      } else {
        value = value.value ?? value.data?.value ?? value.data ?? value.result ?? '';
      }
    }
    return parseMaybeJson(value);
  }

  async function tinyWebDbRequest(action, extra = {}) {
    const body = new URLSearchParams({
      user: tinyWebDbUser,
      secret: tinyWebDbSecret,
      action,
      ...extra
    });
    const response = await fetch(tinyWebDbUrl, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body
    });
    if (!response.ok) throw new Error(`TinyWebDB ${response.status}`);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async function readTag(tag) {
    const result = await tinyWebDbRequest('get', { tag });
    return unwrapValue(result, tag);
  }

  async function writeTag(tag, value) {
    const operation = () => tinyWebDbRequest('update', {
      tag,
      value: typeof value === 'string' ? value : JSON.stringify(value)
    });
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  function normalizeThemeCode(value) {
    const parsed = unwrapValue(value);
    if (parsed && typeof parsed === 'object') {
      return normalizeThemeCode(parsed.code || parsed.theme || parsed.topic || parsed.value);
    }
    const raw = String(parsed || '').trim().toUpperCase();
    if (themeAliases[raw] !== undefined) return themeAliases[raw];
    if (window.AppData.themes[raw]) return raw;
    return '';
  }

  function normalizeStats(value) {
    const parsed = value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : unwrapValue(value);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      score: Number(parsed.score || 0),
      correct: Number(parsed.correct || 0),
      wrong: Number(parsed.wrong || 0),
      level: ['idle', 'easy', 'normal', 'hard'].includes(parsed.level) ? parsed.level : 'idle',
      updatedAt: String(parsed.updatedAt || '')
    };
  }

  function normalizeMode(value) {
    const raw = String(unwrapValue(value) || '').trim().toLowerCase();
    const mode = raw.startsWith('mode_') ? raw.slice(5) : raw;
    const aliases = { answer: 'dati', quiz: 'dati', dati: 'dati' };
    const normalized = aliases[mode] || mode;
    return ['idle', 'dati', 'keyword', 'theme', 'countdown'].includes(normalized) ? normalized : 'idle';
  }

  function normalizeAnswer(value) {
    const raw = String(unwrapValue(value) || '').trim().toUpperCase();
    if (/^ANSWER_[A-D]$/.test(raw)) return raw.slice(-1);
    if (/^[A-D]$/.test(raw)) return raw;
    return '';
  }

  async function readCloudSnapshot() {
    const results = await Promise.allSettled([
      readTag(tags.topic),
      readTag(tags.legacyTopic),
      readTag(tags.page),
      readTag(tags.mode),
      readTag(tags.stats),
      readTag(tags.answer)
    ]);
    if (!results.some((item) => item.status === 'fulfilled')) {
      throw new Error('TinyWebDB 无响应');
    }
    const values = results.map((item) => item.status === 'fulfilled' ? item.value : '');

    const topic = normalizeThemeCode(values[0]) || normalizeThemeCode(values[1]);
    return {
      topic,
      page: String(unwrapValue(values[2]) || ''),
      mode: normalizeMode(values[3]),
      stats: normalizeStats(values[4]),
      answer: normalizeAnswer(values[5])
    };
  }

  function openThemeFromCloud(code) {
    if (!code) return;
    setThemeCode(code);
    emit('htai:topic', { code, source: 'cloud' });
    emit('htai:theme', { code, source: 'cloud' });
    if (document.body?.dataset.page === 'science' && window.AppScience) {
      window.AppScience.activate(code, true);
      return;
    }
    if (document.body?.dataset.page === 'index') {
      location.href = `science.html?v=network5&theme=${encodeURIComponent(code)}&source=cloud`;
    }
  }

  function openPageFromCloud(snapshot) {
    const page = String(snapshot.page || '').toLowerCase();
    const mode = snapshot.mode;
    const target = mode === 'dati' || mode === 'countdown'
      ? 'quiz.html?v=network5&mode=dati'
      : mode === 'keyword'
        ? `science.html?v=network5&mode=keyword&theme=${encodeURIComponent(getThemeCode('A'))}`
        : mode === 'theme'
          ? 'science.html?v=network5&mode=theme'
          : '';
    if (!target || location.pathname.endsWith(target.split('?')[0])) return;
    location.href = target;
  }

  function publishSnapshot(snapshot) {
    const changed = JSON.stringify(snapshot) !== JSON.stringify(lastSnapshot);
    if (!changed) return;
    const previous = lastSnapshot;
    const firstSnapshot = previous === null;
    lastSnapshot = snapshot;

    if (snapshot.stats && JSON.stringify(snapshot.stats) !== JSON.stringify(previous?.stats)) {
      emit('htai:stats', snapshot.stats);
    }
    if (snapshot.answer && snapshot.answer !== previous?.answer) {
      emit('htai:answer', { letter: snapshot.answer, source: 'cloud' });
      writeTag(tags.answer, '').catch(() => {});
    }
    if (snapshot.mode !== previous?.mode) {
      emit('htai:mode', { mode: snapshot.mode, source: 'cloud' });
      localStorage.setItem('htai-mode', snapshot.mode);
      // A stored mode is state, not a navigation command. Only a later mode
      // change from the home or device page may open the requested page.
      if (!firstSnapshot && snapshot.mode !== 'idle'
        && ['index', 'device'].includes(document.body?.dataset.page)) {
        openPageFromCloud(snapshot);
      }
    }
    if (snapshot.topic && snapshot.topic !== lastTopicCode) {
      lastTopicCode = snapshot.topic;
      // HTAI_TOPIC is shared state. Keep it available long enough for the
      // board to poll it too; clearing it here caused a read race.
      openThemeFromCloud(snapshot.topic);
    }
  }

  async function pollCloud() {
    if (pollBusy) return;
    pollBusy = true;
    try {
      const snapshot = await readCloudSnapshot();
      const firstSuccess = !networkReady;
      networkReady = true;
      setStatus('网络同步正常', true);
      if (firstSuccess) emit('htai:connection', { connected: true, source: 'cloud' });
      publishSnapshot(snapshot);
    } catch (error) {
      const firstFailure = networkReady;
      networkReady = false;
      setStatus('网络暂时不可用', false);
      if (firstFailure) emit('htai:connection', { connected: false, source: 'cloud' });
    } finally {
      pollBusy = false;
    }
  }

  function startCloudPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollCloud();
    pollTimer = setInterval(pollCloud, 2500);
  }

  function commandTarget(command) {
    const modeMap = {
      MODE_DATI: { mode: 'dati', page: 'quiz' },
      MODE_KEYWORD: { mode: 'keyword', page: 'science' },
      MODE_THEME: { mode: 'theme', page: 'science' },
      MODE_COUNTDOWN: { mode: 'countdown', page: 'quiz' },
      MODE_IDLE: { mode: 'idle', page: 'home' }
    };
    if (modeMap[command]) {
      return Promise.all([
        writeTag(tags.mode, modeMap[command].mode),
        writeTag(tags.page, modeMap[command].page),
        writeTag(tags.command, command)
      ]);
    }
    if (/^TIME_(5|6|7|8|9|10)$/.test(command)) {
      return writeTag(tags.command, command);
    }
    if (command.startsWith('DATA_KEY:')) {
      return writeTag(tags.keyword, command.slice(9));
    }
    if (command === 'STAR' || command === 'QOK1' || command === 'QOK2_FLASH' || command === 'QBAD') {
      return writeTag(tags.effect, command);
    }
    if (command.startsWith('STAT_')) {
      return writeTag(tags.command, command);
    }
    if (command.startsWith('ACH')) {
      return writeTag(tags.command, command);
    }
    return writeTag(tags.command, command);
  }

  async function sendCommand(command, options = {}) {
    const quiet = Boolean(options.quiet);
    if (!networkReady) {
      if (!quiet) showToast('网络未连接，暂时不能发送');
      return false;
    }
    try {
      await commandTarget(String(command));
      if (!quiet) showToast(`已写入网络：${command}`);
      return true;
    } catch (error) {
      if (!quiet) showToast(`网络写入失败：${error.message || error}`);
      return false;
    }
  }

  function sendMode(modeName) {
    const cleanMode = String(modeName).trim().toUpperCase().replace(/^MODE_/, '');
    return sendCommand(`MODE_${cleanMode}`, { quiet: true });
  }

  function sendAnswerResult(correct, level) {
    const effect = correct
      ? (level === 'hard' ? 'STAR' : level === 'normal' ? 'QOK2_FLASH' : 'QOK1')
      : 'QBAD';
    return Promise.all([
      writeTag(tags.effect, effect),
      writeTag('HTAI_LAST_RESULT', JSON.stringify({
        correct: Boolean(correct),
        level,
        updatedAt: new Date().toISOString()
      }))
    ]).catch(() => false);
  }

  function sendQuizStats(score, correct, wrong, level) {
    return syncQuizStats({ score, correct, wrong, level });
  }

  function sendQuestion(index, question, optA, optB, optC, optD) {
    return writeTag(tags.question, {
      index,
      question,
      options: [optA, optB, optC, optD],
      updatedAt: new Date().toISOString()
    }).catch(() => false);
  }

  function sendKeyword(keyword) {
    return writeTag(tags.keyword, keyword).catch(() => false);
  }

  function sendTTS(text) {
    return writeTag(tags.tts, text).catch(() => false);
  }

  async function loadQuizStats() {
    return normalizeStats(await readTag(tags.stats).catch(() => null));
  }

  async function syncQuizStats(stats) {
    return writeTag(tags.stats, {
      score: Number(stats.score || 0),
      correct: Number(stats.correct || 0),
      wrong: Number(stats.wrong || 0),
      level: String(stats.level || 'easy'),
      updatedAt: String(stats.updatedAt || new Date().toISOString())
    });
  }

  function initCommon() {
    setStatus(latestStatus, false);
    startCloudPolling();
    $('#cloudRefresh')?.addEventListener('click', () => {
      pollCloud();
      showToast('正在刷新网络状态');
    });
    $all('[data-send-command]').forEach((button) => {
      button.addEventListener('click', () => sendCommand(button.dataset.sendCommand));
    });
    $all('[data-theme-link]').forEach((link) => {
      link.addEventListener('click', () => setThemeCode(link.dataset.themeLink));
    });
  }

  window.App = {
    getThemeCode,
    setThemeCode,
    isNetworkReady,
    isBluetoothConnected: isNetworkReady,
    sendCommand,
    sendMode,
    sendAnswerResult,
    sendQuizStats,
    sendQuestion,
    sendKeyword,
    sendTTS,
    loadQuizStats,
    syncQuizStats,
    tinyWebDbRequest,
    readTag,
    writeTag,
    showToast,
    $,
    $all
  };

  document.addEventListener('DOMContentLoaded', initCommon);
})();
