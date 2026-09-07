(function () {
  const modeMeta = {
    dati: {
      label: '答题模式',
      cloudMode: 'DATI',
      href: 'quiz.html?v=network4&mode=dati'
    },
    keyword: {
      label: '关键词模式',
      cloudMode: 'KEYWORD',
      href: `science.html?v=network4&mode=keyword&theme=${encodeURIComponent(window.App?.getThemeCode('A') || 'A')}`
    },
    theme: {
      label: '主题选择模式',
      cloudMode: 'THEME',
      href: 'science.html?v=network4&mode=theme'
    },
    countdown: {
      label: '倒计时模式',
      cloudMode: 'COUNTDOWN',
      href: 'quiz.html?v=network4&mode=countdown'
    },
    idle: {
      label: '待机',
      cloudMode: 'IDLE',
      href: ''
    }
  };

  let networkReady = false;
  let currentMode = localStorage.getItem('htai-mode') || 'idle';
  if (!modeMeta[currentMode]) currentMode = 'idle';
  const buttons = Array.from(document.querySelectorAll('[data-mode]'));

  function setLocked() {
    const hint = document.getElementById('modeHint');
    const current = document.getElementById('currentModeText');
    buttons.forEach((button) => {
      button.disabled = !networkReady;
    });
    if (hint) {
      hint.textContent = networkReady
        ? 'TinyWebDB 已连接，可以进入四种互动模式。'
        : '正在连接 TinyWebDB，网络可用后解锁模式按钮。';
    }
    if (current) {
      current.textContent = `当前模式：${modeMeta[currentMode]?.label || '待机'}`;
    }
  }

  async function chooseMode(mode) {
    const meta = modeMeta[mode];
    if (!meta || !networkReady) return;
    const sent = await window.App.sendMode(meta.cloudMode);
    if (!sent) return;
    currentMode = mode;
    localStorage.setItem('htai-mode', mode);
    setLocked();
    if (meta.href) location.href = meta.href;
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => chooseMode(button.dataset.mode));
  });

  window.addEventListener('htai:connection', (event) => {
    networkReady = Boolean(event.detail?.connected);
    setLocked();
  });

  window.addEventListener('htai:mode', (event) => {
    const cloudMode = String(event.detail?.mode || '').toLowerCase();
    if (!modeMeta[cloudMode]) return;
    currentMode = cloudMode;
    localStorage.setItem('htai-mode', cloudMode);
    setLocked();
  });

  setLocked();
})();
