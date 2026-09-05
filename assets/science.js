(function () {
  const params = new URLSearchParams(location.search);
  const requestedMode = params.get('mode') || 'normal';
  const selectableThemeCodes = window.AppData.themeOrder.slice(0, 7);

  let activeThemeCode = 'A';
  let keywordTimer = null;
  let keywordItems = [];
  let keywordIndex = 0;
  let keywordPaused = false;

  function activate(code, fromHardware) {
    const data = window.AppData.themes[code] || window.AppData.themes.A;
    activeThemeCode = data.code;
    window.App.setThemeCode(data.code);
    document.documentElement.style.setProperty('--theme', data.accent);
    window.App.$('#themeCode').textContent = data.code;
    window.App.$('#themeTitle').textContent = data.title;
    window.App.$('#videoLabel').textContent = data.videoLabel;
    window.App.$('#themeCopy').textContent = data.copy;
    window.App.$('#themeFacts').innerHTML = (data.facts || []).map((item) => `<li>${item}</li>`).join('');
    window.App.$('#themePrompt').textContent = data.prompt || '';
    window.App.$('#themeSource').textContent = data.source;

    const video = window.App.$('#themeVideo');
    video.src = data.video + (data.video.includes('?') ? '&' : '?') + 'v=tech8';
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.volume = 1;
    video.play().catch(() => {});
    const soundToggle = window.App.$('#soundToggle');
    if (soundToggle) soundToggle.textContent = '打开声音';

    window.App.$all('.theme-button').forEach((button) => {
      button.classList.toggle('active', button.dataset.theme === data.code);
    });

    if (requestedMode === 'keyword') buildKeywordList(data);
    if (fromHardware) window.App.showToast(`收到硬件指令：${data.title}`);
  }

  function buildKeywordList(data) {
    keywordItems = [
      data.title,
      ...(data.facts || []),
      data.prompt || ''
    ].filter(Boolean);
    keywordIndex = 0;
    const scroll = window.App.$('#keywordScroll');
    if (scroll) scroll.textContent = '等待关键词发送...';
    scheduleKeywords();
  }

  function scheduleKeywords() {
    if (keywordTimer) clearInterval(keywordTimer);
    if (!keywordItems.length) return;
    const video = window.App.$('#themeVideo');
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const rawInterval = duration > 0 ? (duration * 1000) / keywordItems.length : 3000;
    const interval = Math.max(2000, Math.min(5000, rawInterval));
    keywordTimer = setInterval(showNextKeyword, interval);
  }

  function showNextKeyword() {
    if (keywordPaused || !keywordItems.length) return;
    const item = keywordItems[keywordIndex % keywordItems.length];
    const scroll = window.App.$('#keywordScroll');
    if (scroll) {
      scroll.textContent = item;
      scroll.classList.remove('keyword-in');
      void scroll.offsetWidth;
      scroll.classList.add('keyword-in');
    }
    window.App.sendCommand(`DATA_KEY:${item}`, { quiet: true });
    keywordIndex += 1;
  }

  function setKeywordPaused(paused) {
    keywordPaused = paused;
  }

  function handleThemeSignal(event) {
    if (requestedMode !== 'theme') return;
    const index = Number(event.detail?.index);
    if (!Number.isInteger(index) || index < 1 || index > selectableThemeCodes.length) return;
    const code = selectableThemeCodes[index - 1];
    activate(code, true);
  }

  function initScience() {
    const grid = window.App.$('#themeGrid');
    grid.innerHTML = window.AppData.themeOrder.map((code) => {
      const item = window.AppData.themes[code];
      return `<button class="theme-button" data-theme="${code}" type="button">${code} · ${item.shortTitle}</button>`;
    }).join('');
    window.App.$all('.theme-button', grid).forEach((button) => {
      button.addEventListener('click', () => activate(button.dataset.theme));
    });
    window.App.$('#soundToggle').addEventListener('click', async () => {
      const video = window.App.$('#themeVideo');
      video.muted = !video.muted;
      window.App.$('#soundToggle').textContent = video.muted ? '打开声音' : '关闭声音';
      try {
        await video.play();
      } catch (error) {
        window.App.showToast('浏览器限制声音，请再点一次声音按钮');
      }
    });
    window.App.$('#speakScience')?.addEventListener('click', () => {
      const data = window.AppData.themes[activeThemeCode] || window.AppData.themes.A;
      if (!('speechSynthesis' in window)) {
        window.App.showToast('当前浏览器不支持朗读讲解');
        return;
      }
      window.speechSynthesis.cancel();
      const detail = [data.title, data.copy, ...(data.facts || []), data.prompt || ''].filter(Boolean).join('。');
      const utterance = new SpeechSynthesisUtterance(detail);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.92;
      utterance.pitch = 1.02;
      window.speechSynthesis.speak(utterance);
      window.App.showToast('正在朗读科普讲解');
    });

    const video = window.App.$('#themeVideo');
    video.addEventListener('loadedmetadata', () => {
      if (requestedMode === 'keyword') scheduleKeywords();
    });

    window.addEventListener('htai:theme', handleThemeSignal);
    window.addEventListener('htai:connection', (event) => {
      if (requestedMode === 'keyword') setKeywordPaused(!event.detail?.connected);
    });

    const modeNotice = window.App.$('#scienceModeNotice');
    const themeSelector = window.App.$('#themeSelectorPanel');
    const keywordPanel = window.App.$('#keywordPanel');
    const modeNoticePanel = window.App.$('#modeNoticePanel');

    if (requestedMode === 'keyword') {
      themeSelector.hidden = true;
      keywordPanel.hidden = false;
      modeNoticePanel.hidden = false;
      modeNotice.textContent = '关键词模式：网页与掌控板同步滚动当前主题讲解词。';
    } else if (requestedMode === 'theme') {
      themeSelector.hidden = true;
      keywordPanel.hidden = true;
      modeNoticePanel.hidden = false;
      modeNotice.textContent = '主题选择模式：请按掌控板选择 1-7，网页等待硬件回传。';
    } else {
      themeSelector.hidden = false;
      keywordPanel.hidden = true;
      modeNoticePanel.hidden = true;
    }

    activate(window.App.getThemeCode('A'));
  }

  window.AppScience = { activate };
  document.addEventListener('DOMContentLoaded', initScience);
})();
