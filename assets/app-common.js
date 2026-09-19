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
    voiceId: 'HTAI_VOICE_ID',
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
  let pollFailureCount = 0;
  let latestStatus = '连接中';
  let lastSnapshot = null;
  let lastTopicCode = '';
  const requestTimeoutMs = 8000;
  const requestAttempts = 2;

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
    const failed = /失败|不可用|错误/.test(text);
    $all('#cloudStatus,#btStatus,[data-cloud-status],[data-bt-status]').forEach((node) => {
      node.textContent = text;
      node.classList.toggle('ok', Boolean(connected));
      node.classList.toggle('error', failed);
    });
    $all('[data-network-panel]').forEach((panel) => {
      panel.classList.toggle('is-connected', Boolean(connected));
      panel.classList.toggle('is-error', failed);
      panel.classList.toggle('is-connecting', !connected && !failed);
    });
    $all('#cloudSyncTime').forEach((node) => {
      if (connected) {
        node.textContent = `最后同步 ${new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })}`;
      } else if (failed) {
        node.textContent = '请检查网络后重新连接';
      }
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

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function tinyWebDbRequest(action, extra = {}) {
    const body = new URLSearchParams({
      user: tinyWebDbUser,
      secret: tinyWebDbSecret,
      action,
      ...extra
    });
    let lastError = null;
    for (let attempt = 0; attempt < requestAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(tinyWebDbUrl, {
          method: 'POST',
          mode: 'cors',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
          },
          body,
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`TinyWebDB ${response.status}`);
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      } catch (error) {
        lastError = error?.name === 'AbortError'
          ? new Error('TinyWebDB 请求超时')
          : error;
        if (attempt + 1 < requestAttempts) await wait(250);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError || new Error('TinyWebDB 请求失败');
  }

  async function readTag(tag) {
    const result = await tinyWebDbRequest('get', { tag });
    return unwrapValue(result, tag);
  }

  async function writeTags(entries) {
    const normalized = entries
      .filter((entry) => entry && entry.tag)
      .map((entry) => ({
        tag: entry.tag,
        value: typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)
      }));
    if (!normalized.length) return [];
    const operation = () => Promise.all(
      normalized.map((entry) => tinyWebDbRequest('update', entry))
    );
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  function writeTag(tag, value) {
    return writeTags([{ tag, value }]).then((results) => results[0]);
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

  function voiceIdTarget(value) {
    const raw = String(unwrapValue(value) || '').trim().toUpperCase().replace(/^VOICE[_-]?/, '');
    const id = raw.match(/\d+/)?.[0] || '';
    const map = {
      53: { topic: 'A', page: 'science' },
      54: { topic: 'B', page: 'science' },
      55: { topic: 'P', page: 'science' },
      56: { topic: 'Y', page: 'science' },
      57: { topic: 'T', page: 'science' },
      58: { topic: 'O', page: 'science' },
      59: { topic: 'N', page: 'science' },
      60: { mode: 'dati', page: 'quiz' },
      61: { topic: 'ALL', page: 'science' }
    };
    return id && map[id] ? { id, ...map[id] } : { id: '', topic: '', mode: '', page: '' };
  }

  function normalizeAnswer(value) {
    const raw = String(unwrapValue(value) || '').trim().toUpperCase();
    if (/^ANSWER_[A-D]$/.test(raw)) return raw.slice(-1);
    if (/^[A-D]$/.test(raw)) return raw;
    return '';
  }

  function extractSearchValues(result) {
    const values = {};
    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node !== 'object') return;
      const tag = node.tag ?? node.name ?? node.key;
      if (typeof tag === 'string' && tag) {
        values[tag] = node.value ?? node.data ?? '';
        return;
      }
      Object.entries(node).forEach(([key, value]) => {
        if (key === 'data' || key === 'result' || key === 'items' || key === 'rows') {
          visit(value);
        } else if (key.startsWith('HTAI_') || key === tags.legacyTopic) {
          values[key] = value;
        }
      });
    };
    visit(result);
    return values;
  }

  async function readCloudSearch() {
    const result = await tinyWebDbRequest('search', {
      no: '1',
      count: '100',
      type: 'both'
    });
    const values = extractSearchValues(result);
    if (!Object.keys(values).length) {
      throw new Error('TinyWebDB 搜索结果为空');
    }
    return values;
  }

  async function readCloudFallback() {
    const results = await Promise.allSettled([
      readTag(tags.topic),
      readTag(tags.legacyTopic),
      readTag(tags.page),
      readTag(tags.mode),
      readTag(tags.stats),
      readTag(tags.answer),
      readTag(tags.voiceId)
    ]);
    if (!results.some((item) => item.status === 'fulfilled')) {
      throw new Error('TinyWebDB 无响应');
    }
    const values = results.map((item) => item.status === 'fulfilled' ? item.value : '');
    return {
      [tags.topic]: values[0],
      [tags.legacyTopic]: values[1],
      [tags.page]: values[2],
      [tags.mode]: values[3],
      [tags.stats]: values[4],
      [tags.answer]: values[5],
      [tags.voiceId]: values[6]
    };
  }

  async function readCloudSnapshot() {
    let values;
    try {
      values = await readCloudSearch();
    } catch (searchError) {
      values = await readCloudFallback();
    }

    const voiceTarget = voiceIdTarget(values[tags.voiceId]);
    const topic = voiceTarget.topic
      || normalizeThemeCode(values[tags.topic])
      || normalizeThemeCode(values[tags.legacyTopic]);
    return {
      topic,
      page: voiceTarget.page || String(unwrapValue(values[tags.page]) || ''),
      mode: voiceTarget.mode || normalizeMode(values[tags.mode]),
      keyword: String(unwrapValue(values[tags.keyword]) || '').trim(),
      stats: normalizeStats(values[tags.stats]),
      answer: normalizeAnswer(values[tags.answer]),
      voiceId: voiceTarget.id,
      voiceTopic: Boolean(voiceTarget.topic),
      voiceMode: Boolean(voiceTarget.mode)
    };
  }

  function openThemeFromCloud(code, options = {}) {
    if (!code) return;
    setThemeCode(code);
    emit('htai:topic', { code, source: 'cloud' });
    emit('htai:theme', { code, source: 'cloud' });
    if (document.body?.dataset.page === 'science' && window.AppScience) {
      window.AppScience.activate(code, true);
      return;
    }
    if (options.forceNavigate || document.body?.dataset.page === 'index') {
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
    if (snapshot.keyword && snapshot.keyword !== previous?.keyword) {
      emit('htai:keyword', { keyword: snapshot.keyword, source: 'cloud' });
    }
    if (snapshot.answer && snapshot.answer !== previous?.answer) {
      emit('htai:answer', { letter: snapshot.answer, source: 'cloud' });
      writeTag(tags.answer, '').catch(() => {});
    }
    if (snapshot.voiceId) {
      writeTag(tags.voiceId, '').catch(() => {});
    }
    if (snapshot.mode !== previous?.mode || snapshot.voiceMode) {
      emit('htai:mode', { mode: snapshot.mode, source: 'cloud' });
      localStorage.setItem('htai-mode', snapshot.mode);
      // A stored mode is state, not a navigation command. Only a later mode
      // change from the home or device page may open the requested page.
      if (!snapshot.voiceTopic && snapshot.mode !== 'idle'
        && (!firstSnapshot || snapshot.voiceMode)
        && ['home', 'index', 'device'].includes(document.body?.dataset.page)) {
        openPageFromCloud(snapshot);
      }
    }
    if (snapshot.topic && (snapshot.topic !== lastTopicCode || snapshot.voiceTopic)) {
      lastTopicCode = snapshot.topic;
      // HTAI_TOPIC is shared state. Keep it available long enough for the
      // board to poll it too; clearing it here caused a read race.
      if (!firstSnapshot || snapshot.voiceTopic) {
        openThemeFromCloud(snapshot.topic, { forceNavigate: snapshot.voiceTopic });
      }
    }
  }

  async function pollCloud() {
    if (pollBusy) return;
    pollBusy = true;
    try {
      const snapshot = await readCloudSnapshot();
      const firstSuccess = !networkReady;
      pollFailureCount = 0;
      networkReady = true;
      setStatus('已连接', true);
      if (firstSuccess) emit('htai:connection', { connected: true, source: 'cloud' });
      publishSnapshot(snapshot);
    } catch (error) {
      const firstFailure = networkReady;
      pollFailureCount += 1;
      networkReady = false;
      setStatus('连接失败，请检查网络', false);
      if (firstFailure) emit('htai:connection', { connected: false, source: 'cloud' });
    } finally {
      pollBusy = false;
      const delay = networkReady
        ? 2500
        : Math.min(20000, 5000 * (2 ** Math.min(pollFailureCount - 1, 2)));
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(pollCloud, delay);
    }
  }

  function startCloudPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    pollFailureCount = 0;
    pollCloud();
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
      return writeTags([
        { tag: tags.mode, value: modeMap[command].mode },
        { tag: tags.page, value: modeMap[command].page },
        { tag: tags.voiceId, value: '' },
        { tag: tags.command, value: command }
      ]);
    }
    if (/^TIME_20$/.test(command)) {
      return writeTag(tags.command, command);
    }
    if (command.startsWith('DATA_KEY:')) {
      return writeTag(tags.keyword, command.slice(9));
    }
    if (command === 'QOK1' || command === 'QOK2_FLASH' || command === 'QBAD') {
      return writeTag(tags.effect, command);
    }
    if (command === 'STAR' || command === 'MUSIC' || command === 'WARN') {
      return writeTag(tags.command, command);
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
    const feedbackCommand = correct ? 'RESULT_OK' : 'RESULT_BAD';
    return writeTags([
      { tag: tags.effect, value: effect },
      { tag: tags.command, value: feedbackCommand },
      {
        tag: 'HTAI_LAST_RESULT',
        value: {
          correct: Boolean(correct),
          level,
          updatedAt: new Date().toISOString()
        }
      }
    ]).catch(() => false);
  }

  function sendQuizStats(score, correct, wrong, level) {
    return syncQuizStats({ score, correct, wrong, level });
  }

  function resetQuizStats() {
    const stats = {
      score: 0,
      correct: 0,
      wrong: 0,
      level: 'idle',
      updatedAt: new Date().toISOString()
    };
    return writeTag(tags.stats, stats).then(() => {
      emit('htai:stats', stats);
      return stats;
    });
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
      level: String(stats.level || 'idle'),
      updatedAt: String(stats.updatedAt || new Date().toISOString())
    });
  }

  function initCommon() {
    setStatus(latestStatus, false);
    startCloudPolling();
    $('#cloudRefresh')?.addEventListener('click', () => {
      pollCloud();
      showToast('正在重新连接');
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
    resetQuizStats,
    sendQuestion,
    sendKeyword,
    sendTTS,
    loadQuizStats,
    syncQuizStats,
    tinyWebDbRequest,
    readTag,
    writeTag,
    writeTags,
    showToast,
    $,
    $all
  };

  document.addEventListener('DOMContentLoaded', initCommon);
})();
