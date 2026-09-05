(function () {
  const modeMeta = {
    dati: {
      label: '答题模式',
      command: 'MODE_DATI',
      href: 'quiz.html?v=tech8&mode=dati'
    },
    keyword: {
      label: '关键词模式',
      command: 'MODE_KEYWORD',
      href: `science.html?v=tech8&mode=keyword&theme=${encodeURIComponent(window.App?.getThemeCode('A') || 'A')}`
    },
    theme: {
      label: '主题选择模式',
      command: 'MODE_THEME',
      href: 'science.html?v=tech8&mode=theme'
    },
    idle: {
      label: '待机',
      command: 'MODE_IDLE',
      href: ''
    }
  };

  let connected = false;
  let currentMode = localStorage.getItem('htai-mode') || 'idle';
  if (!modeMeta[currentMode]) currentMode = 'idle';

  const buttons = Array.from(document.querySelectorAll('[data-mode]'));

  function setLocked() {
    const hint = document.getElementById('modeHint');
    const current = document.getElementById('currentModeText');
    buttons.forEach((button) => {
      button.disabled = !connected;
    });
    if (hint) {
      hint.textContent = connected
        ? '蓝牙已连接，可进入任意互动模式。'
        : '连接 HTAI-JJ 后解锁，未连接时模式按钮不可用。';
    }
    if (current) {
      current.textContent = `当前模式：${modeMeta[currentMode]?.label || '待机'}`;
    }
  }

  async function chooseMode(mode) {
    const meta = modeMeta[mode];
    if (!meta || !connected) return;
    const sent = await window.App.sendCommand(meta.command);
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
    connected = Boolean(event.detail?.connected);
    setLocked();
  });

  setLocked();
})();
