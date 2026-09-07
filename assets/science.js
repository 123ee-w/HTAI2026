(function () {
  const params = new URLSearchParams(location.search);
  const requestedMode = params.get('mode') || 'normal';
  const selectableThemeCodes = window.AppData.themeOrder.slice(0, 7);

  let activeThemeCode = window.App?.getThemeCode('A') || 'A';
  let keywordTimer = null;
  let keywordItems = [];
  let keywordIndex = 0;

  function activate(code, fromCloud) {
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
    if (!video) return;
    video.hidden = false;
    const status = window.App.$('#videoStatus');
    if (status) status.textContent = '';
    video.src = data.video + (data.video.includes('?') ? '&' : '?') + 'v=network4';
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.volume = 1;
    video.load();
    video.play().catch(() => {});
    window.App.$all('.theme-button').forEach((button) => {
      button.classList.toggle('active', button.dataset.theme === data.code);
    });

    if (requestedMode === 'keyword') buildKeywordList(data);
    if (fromCloud) window.App.showToast(`已同步：${data.title}`);
  }

  function buildKeywordList(data) {
    keywordItems = [data.title, ...(data.facts || []), data.prompt || ''].filter(Boolean);
    keywordIndex = 0;
    const scroll = window.App.$('#keywordScroll');
    if (scroll) scroll.textContent = '等待关键词同步...';
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
    if (!keywordItems.length) return;
    const item = keywordItems[keywordIndex % keywordItems.length];
    const scroll = window.App.$('#keywordScroll');
    if (scroll) {
      scroll.textContent = item;
      scroll.classList.remove('keyword-in');
      void scroll.offsetWidth;
      scroll.classList.add('keyword-in');
    }
    window.App.sendKeyword(item);
    keywordIndex += 1;
  }

  function handleThemeSignal(event) {
    if (requestedMode !== 'theme' && event.detail?.source === 'cloud') {
      activate(event.detail.code, true);
      return;
    }
    if (requestedMode !== 'theme') return;
    const code = event.detail?.code;
    if (code && window.AppData.themes[code]) {
      activate(code, true);
      return;
    }
    const index = Number(event.detail?.index);
    if (Number.isInteger(index) && index >= 1 && index <= selectableThemeCodes.length) {
      activate(selectableThemeCodes[index - 1], true);
    }
  }

  function initScience() {
    const grid = window.App.$('#themeGrid');
    grid.innerHTML = selectableThemeCodes.map((code) => {
      const item = window.AppData.themes[code];
      return `<button class="theme-button" data-theme="${code}" type="button">${code} · ${item.shortTitle}</button>`;
    }).join('');
    window.App.$all('.theme-button', grid).forEach((button) => {
      button.addEventListener('click', () => activate(button.dataset.theme));
    });

    const playVideo = window.App.$('#playVideo');
    const video = window.App.$('#themeVideo');
    const toggleSound = async () => {
      video.muted = !video.muted;
      if (playVideo) playVideo.textContent = video.muted ? '播放视频并打开声音' : '关闭声音';
      try {
        await video.play();
      } catch {
        window.App.showToast('浏览器限制声音，请再点一次声音按钮');
      }
    };
    playVideo?.addEventListener('click', async () => {
      if (video.paused) {
        video.muted = false;
        try {
          await video.play();
          playVideo.textContent = '关闭声音';
        } catch {
          window.App.showToast('视频暂时无法播放，请再点一次播放按钮');
        }
      } else {
        await toggleSound();
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

    const videoStatus = window.App.$('#videoStatus');
    video.addEventListener('error', () => {
      if (videoStatus) videoStatus.textContent = '视频加载失败，请检查本地 assets/videos 文件是否完整。';
    });
    video.addEventListener('loadeddata', () => {
      if (videoStatus) videoStatus.textContent = '';
    });
    video.addEventListener('loadedmetadata', () => {
      if (requestedMode === 'keyword') scheduleKeywords();
    });

    window.addEventListener('htai:theme', handleThemeSignal);
    window.addEventListener('htai:topic', handleThemeSignal);

    const modeNotice = window.App.$('#scienceModeNotice');
    const themeSelector = window.App.$('#themeSelectorPanel');
    const keywordPanel = window.App.$('#keywordPanel');
    const modeNoticePanel = window.App.$('#modeNoticePanel');

    if (requestedMode === 'keyword') {
      if (themeSelector) themeSelector.hidden = true;
      if (keywordPanel) keywordPanel.hidden = false;
      if (modeNoticePanel) modeNoticePanel.hidden = false;
      if (modeNotice) modeNotice.textContent = '关键词模式：网页按视频时长均匀滚动，并同步写入 TinyWebDB。';
    } else if (requestedMode === 'theme') {
      if (themeSelector) themeSelector.hidden = true;
      if (keywordPanel) keywordPanel.hidden = true;
      if (modeNoticePanel) modeNoticePanel.hidden = false;
      if (modeNotice) modeNotice.textContent = '主题选择模式：等待掌控板语音主题同步到网页。';
    } else {
      if (themeSelector) themeSelector.hidden = false;
      if (keywordPanel) keywordPanel.hidden = true;
      if (modeNoticePanel) modeNoticePanel.hidden = true;
    }

    activate(activeThemeCode);
  }

  window.AppScience = { activate };
  document.addEventListener('DOMContentLoaded', initScience);
})();
