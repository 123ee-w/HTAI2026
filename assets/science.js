(function () {
  let activeThemeCode = 'A';

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
    video.src = data.video + (data.video.includes('?') ? '&' : '?') + 'v=tech7';
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

    if (fromHardware) window.App.showToast(`收到硬件指令：${data.title}`);
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
    activate(window.App.getThemeCode('A'));
  }

  window.AppScience = { activate };
  document.addEventListener('DOMContentLoaded', initScience);
})();
