(function () {
  const scoreKey = 'htai-score';
  const wrongKey = 'htai-wrong-list';
  const correctKey = 'htai-correct-count';
  const incorrectKey = 'htai-incorrect-count';
  const quizVersionKey = 'htai-quiz-data-version';
  const quizVersion = 'seven-topic-bank-20260906';

  const params = new URLSearchParams(location.search);
  const networkMode = ['dati', 'countdown'].includes(params.get('mode'));

  if (localStorage.getItem(quizVersionKey) !== quizVersion) {
    localStorage.removeItem(wrongKey);
    localStorage.setItem(quizVersionKey, quizVersion);
  }

  let score = Number(localStorage.getItem(scoreKey) || 0);
  let totalCorrect = Number(localStorage.getItem(correctKey) || 0);
  let totalWrong = Number(localStorage.getItem(incorrectKey) || 0);
  let level = ['idle', 'easy', 'normal', 'hard'].includes(localStorage.getItem('htai-level'))
    ? localStorage.getItem('htai-level')
    : 'idle';
  let current = null;
  let currentChoices = [];
  let answered = false;
  let quizStarted = false;
  let questionReady = false;
  let speechActive = false;
  let countdownTimer = null;
  let countdownRemaining = 0;
  let advanceTimer = null;
  let usedQuestions = new Set();
  let questionSerial = 0;
  let wrongList = JSON.parse(localStorage.getItem(wrongKey) || '[]');
  let lastQuestionKey = '';
  let lastStatsUpdatedAt = Number(localStorage.getItem('htai-stats-updated-at') || 0);
  let modeAnnounced = false;
  let modeAnnouncing = false;

  async function announceQuizMode() {
    if (modeAnnounced || modeAnnouncing || !window.App.isNetworkReady?.()) return;
    modeAnnouncing = true;
    const wanted = params.get('mode') === 'countdown' ? 'COUNTDOWN' : 'DATI';
    const sent = await window.App.sendMode?.(wanted).catch(() => false);
    modeAnnounced = Boolean(sent);
    modeAnnouncing = false;
  }

  function save() {
    localStorage.setItem(scoreKey, String(score));
    localStorage.setItem(wrongKey, JSON.stringify(wrongList));
    localStorage.setItem(correctKey, String(totalCorrect));
    localStorage.setItem(incorrectKey, String(totalWrong));
    localStorage.setItem('htai-level', level);
    const updatedAt = new Date().toISOString();
    lastStatsUpdatedAt = Date.parse(updatedAt);
    localStorage.setItem('htai-stats-updated-at', String(lastStatsUpdatedAt));
    window.App.syncQuizStats?.({
      score,
      correct: totalCorrect,
      wrong: totalWrong,
      level,
      updatedAt
    }).catch(() => {});
  }

  function shuffle(list) {
    return [...list].sort(() => Math.random() - 0.5);
  }

  function questionsForLevel() {
    return window.AppData.quiz.filter((item) => item.level === level);
  }

  function renderScore() {
    window.App.$('#scoreText').textContent = `积分：${score}分`;
    window.App.$('#correctText').textContent = `答对：${totalCorrect}题`;
    window.App.$('#wrongText').textContent = `答错：${totalWrong}题`;
    window.App.$('#levelText').textContent = level === 'hard'
      ? '挑战'
      : level === 'normal'
        ? '进阶'
        : level === 'easy'
          ? '简单'
          : '未选择';
  }

  function renderProgress() {
    const total = level === 'idle' ? 30 : questionsForLevel().length || 30;
    const currentNumber = ((questionSerial - 1) % total) + 1;
    const progress = Math.round((currentNumber / total) * 100);
    const label = window.App.$('#questionProgress');
    const bar = window.App.$('#quizProgressBar');
    if (label) label.textContent = level === 'idle' ? '未开始' : `第 ${currentNumber} / ${total} 题`;
    if (bar) bar.style.width = level === 'idle' ? '0%' : `${progress}%`;
  }

  function applyCloudStats(stats, force = false) {
    if (!stats) return false;
    const cloudTime = Date.parse(stats.updatedAt || '') || 0;
    if (!force && cloudTime && cloudTime < lastStatsUpdatedAt) return false;
    score = Number(stats.score || 0);
    totalCorrect = Number(stats.correct || 0);
    totalWrong = Number(stats.wrong || 0);
    if (['idle', 'easy', 'normal', 'hard'].includes(stats.level)) level = stats.level;
    if (cloudTime) {
      lastStatsUpdatedAt = cloudTime;
      localStorage.setItem('htai-stats-updated-at', String(cloudTime));
    }
    localStorage.setItem(scoreKey, String(score));
    localStorage.setItem(correctKey, String(totalCorrect));
    localStorage.setItem(incorrectKey, String(totalWrong));
    localStorage.setItem('htai-level', level);
    renderScore();
    window.App.$all('[data-level]').forEach((button) => {
      button.classList.toggle('active', button.dataset.level === level);
    });
    return true;
  }

  function clearCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    countdownRemaining = 0;
  }

  function clearAdvance() {
    if (advanceTimer) clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  function startCountdown() {
    clearCountdown();
    window.App.sendCommand('TIME_20', { quiet: true });
    countdownRemaining = 20;
    window.App.$('#quizNotice').textContent = `倒计时：${countdownRemaining} 秒`;
    countdownTimer = setInterval(() => {
      countdownRemaining -= 1;
      const notice = window.App.$('#quizNotice');
      if (countdownRemaining <= 0) {
        clearCountdown();
        notice.textContent = '时间到，本题关闭，准备下一题。';
        answered = true;
        questionReady = false;
        renderAnsweredState('时间到');
        clearAdvance();
      } else {
        notice.textContent = `倒计时：${countdownRemaining} 秒`;
      }
    }, 1000);
  }

  function renderWrongList() {
    const list = window.App.$('#wrongList');
    if (!wrongList.length) {
      list.innerHTML = '<li>暂时没有错题，继续保持。</li>';
      return;
    }
    list.innerHTML = wrongList.map((item, index) => (
      `<li><strong>${index + 1}. ${item.q}</strong><br>` +
      `<span class="muted">正确答案：${item.a}</span><br>` +
      `<button class="secondary" data-redo="${index}" type="button">重新做这题</button></li>`
    )).join('');
    window.App.$all('[data-redo]', list).forEach((button) => {
      button.addEventListener('click', () => {
        clearAdvance();
        clearCountdown();
        current = wrongList[Number(button.dataset.redo)];
        currentChoices = shuffle(current.options);
        answered = false;
        quizStarted = true;
        questionReady = false;
        renderQuestion('正在重做错题。');
        readQuestionThenStart();
      });
    });
  }

  function nextQuestion() {
    clearAdvance();
    clearCountdown();
    if (!quizStarted || level === 'idle') return;
    const pool = questionsForLevel();
    if (!pool.length) return;
    let available = pool.filter((item) => !usedQuestions.has(item.q) && item.q !== lastQuestionKey);
    if (!available.length) {
      usedQuestions.clear();
      available = pool.filter((item) => item.q !== lastQuestionKey);
    }
    if (!available.length) available = pool;
    current = available[Math.floor(Math.random() * available.length)];
    usedQuestions.add(current.q);
    lastQuestionKey = current.q;
    currentChoices = shuffle(current.options);
    questionSerial += 1;
    answered = false;
    renderQuestion(networkMode ? '请选择答案，结果会同步到网络。' : '请选择答案。');
    renderProgress();
    readQuestionThenStart();
  }

  function sendTTS(text) {
    window.App.sendTTS?.(text);
  }

  function renderQuestion(notice) {
    window.App.$('#questionText').textContent = current.q;
    const grid = window.App.$('#choiceGrid');
    grid.innerHTML = currentChoices.map((choice, index) => (
      `<button data-choice="${choice}" type="button">${String.fromCharCode(65 + index)}. ${choice}</button>`
    )).join('');
    window.App.$all('[data-choice]', grid).forEach((button) => {
      button.addEventListener('click', () => selectChoice(button.dataset.choice));
    });
    setChoiceEnabled(false);
    window.App.$('#quizNotice').textContent = notice;
    const explain = window.App.$('#answerExplanation');
    explain.hidden = true;
    explain.textContent = '';
  }

  function setChoiceEnabled(enabled) {
    window.App.$all('[data-choice]').forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function readQuestionThenStart() {
    if (!current || !quizStarted || answered) return;
    questionReady = false;
    speechActive = true;
    setChoiceEnabled(false);
    speakText(
      `${current.q}。选项：${currentChoices.join('，')}`,
      '正在朗读题目，朗读结束后开始 20 秒倒计时。',
      () => {
        speechActive = false;
        if (!quizStarted || answered || !current) return;
        questionReady = true;
        setChoiceEnabled(true);
        startCountdown();
      }
    );
  }

  function renderAnsweredState(message) {
    questionReady = false;
    setChoiceEnabled(false);
  }

  function selectChoice(choice) {
    if (!current || answered || !quizStarted || !questionReady || speechActive) return;
    answered = true;
    clearCountdown();
    clearAdvance();
    const buttons = window.App.$all('[data-choice]');
    if (choice === current.a) {
      score += 10;
      totalCorrect++;
      buttons.find((item) => item.dataset.choice === choice)?.classList.add('correct');
      wrongList = wrongList.filter((item) => item.q !== current.q);
      window.App.$('#quizNotice').textContent = '恭喜你答对了，积分 +10。';
      renderAnsweredState('回答正确');
      window.App.sendAnswerResult?.(true, level);
      sendTTS('恭喜你答对了');
    } else {
      score -= 10;
      totalWrong++;
      buttons.find((item) => item.dataset.choice === choice)?.classList.add('wrong');
      buttons.find((item) => item.dataset.choice === current.a)?.classList.add('correct');
      if (!wrongList.some((item) => item.q === current.q)) wrongList.push(current);
      window.App.$('#quizNotice').textContent = `继续努力，积分 -10。正确答案：${current.a}`;
      renderAnsweredState('回答错误');
      window.App.sendAnswerResult?.(false, level);
      sendTTS('继续努力');
    }
    renderScore();
    save();
    renderWrongList();
    showExplanation();
  }

  function showExplanation() {
    const explain = window.App.$('#answerExplanation');
    if (!current?.explain) {
      explain.hidden = true;
      explain.textContent = '';
      return;
    }
    explain.hidden = false;
    explain.textContent = `讲解：${current.explain}`;
  }

  function speakText(text, successText, onEnd) {
    if (!('speechSynthesis' in window)) {
      window.App.$('#quizNotice').textContent = '当前浏览器不支持朗读。';
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.92;
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utterance);
    window.App.$('#quizNotice').textContent = successText;
  }

  function speakQuestion() {
    if (!current || speechActive) return;
    speakText(`${current.q}。选项：${currentChoices.join('，')}`, '正在朗读题目。');
  }

  function speakExplanation() {
    if (!current || !current.explain) {
      window.App.$('#quizNotice').textContent = '当前题目暂无讲解。';
      return;
    }
    speakText(current.explain, '正在朗读讲解。');
  }

  function handleCloudAnswer(event) {
    const letter = event.detail?.letter;
    if (!letter || !current || answered || !questionReady) return;
    const index = letter.charCodeAt(0) - 65;
    const choice = currentChoices[index];
    if (choice) selectChoice(choice);
  }

  function updateStartButton() {
    const button = window.App.$('#startQuiz');
    if (button) button.disabled = level === 'idle';
  }

  function renderWaitingState(message = '请选择难度，然后点击“开始答题”。') {
    current = null;
    currentChoices = [];
    questionReady = false;
    window.App.$('#questionText').textContent = message;
    window.App.$('#choiceGrid').innerHTML = '';
    window.App.$('#quizNotice').textContent = message;
    window.App.$('#answerExplanation').hidden = true;
    renderProgress();
  }

  function startQuiz() {
    if (level === 'idle') {
      window.App.$('#quizNotice').textContent = '请先选择简单、进阶或挑战难度。';
      return;
    }
    quizStarted = true;
    window.App.$('#startPanel').hidden = true;
    nextQuestion();
  }

  function pauseQuiz() {
    quizStarted = false;
    questionReady = false;
    speechActive = false;
    clearCountdown();
    clearAdvance();
    window.speechSynthesis?.cancel();
    window.App.$('#startPanel').hidden = false;
    renderWaitingState('答题已暂停，点击“是，开始答题”继续。');
    updateStartButton();
  }

  async function resetQuiz() {
    quizStarted = false;
    questionReady = false;
    speechActive = false;
    clearCountdown();
    clearAdvance();
    window.speechSynthesis?.cancel();
    score = 0;
    totalCorrect = 0;
    totalWrong = 0;
    level = 'idle';
    current = null;
    currentChoices = [];
    usedQuestions = new Set();
    questionSerial = 0;
    lastQuestionKey = '';
    wrongList = [];
    const updatedAt = new Date().toISOString();
    lastStatsUpdatedAt = Date.parse(updatedAt);
    localStorage.setItem(scoreKey, '0');
    localStorage.setItem(correctKey, '0');
    localStorage.setItem(incorrectKey, '0');
    localStorage.setItem(wrongKey, '[]');
    localStorage.setItem('htai-level', 'idle');
    localStorage.setItem('htai-stats-updated-at', String(lastStatsUpdatedAt));
    renderScore();
    renderWrongList();
    window.App.$all('[data-level]').forEach((button) => button.classList.remove('active'));
    window.App.$('#startPanel').hidden = false;
    renderWaitingState('已重置，请重新选择难度。');
    updateStartButton();
    try {
      await window.App.resetQuizStats?.();
      window.App.showToast('答题数据已重置并同步到 TinyWebDB');
    } catch {
      window.App.showToast('本地数据已重置，云端同步失败');
    }
  }

  async function initQuiz() {
    const cloudStats = await window.App.loadQuizStats?.().catch(() => null);
    const appliedCloudStats = cloudStats ? applyCloudStats(cloudStats, true) : false;
    renderScore();
    renderWrongList();
    if (!appliedCloudStats) {
      window.App.syncQuizStats?.({
        score,
        correct: totalCorrect,
        wrong: totalWrong,
        level,
        updatedAt: lastStatsUpdatedAt
          ? new Date(lastStatsUpdatedAt).toISOString()
          : new Date().toISOString()
      }).catch(() => {});
    }

    window.App.$all('[data-level]').forEach((button) => {
      button.addEventListener('click', () => {
        clearCountdown();
        clearAdvance();
        window.speechSynthesis?.cancel();
        quizStarted = false;
        questionReady = false;
        speechActive = false;
        level = button.dataset.level;
        usedQuestions = new Set();
        questionSerial = 0;
        lastQuestionKey = '';
        window.App.$all('[data-level]').forEach((item) => item.classList.toggle('active', item === button));
        renderScore();
        window.App.$('#startPanel').hidden = false;
        renderWaitingState('难度已选择，请点击“是，开始答题”。');
        updateStartButton();
        save();
      });
    });
    window.App.$('#resetQuiz').addEventListener('click', resetQuiz);
    window.App.$('#startQuiz').addEventListener('click', startQuiz);
    window.App.$('#pauseQuiz').addEventListener('click', pauseQuiz);
    window.App.$('#nextQuestion').addEventListener('click', nextQuestion);
    window.App.$('#speakQuestion').addEventListener('click', speakQuestion);
    window.App.$('#speakExplain').addEventListener('click', speakExplanation);
    window.addEventListener('htai:answer', handleCloudAnswer);
    window.addEventListener('htai:connection', (event) => {
      if (event.detail?.connected) announceQuizMode();
    });
    window.addEventListener('htai:stats', (event) => {
      applyCloudStats(event.detail);
    });
    announceQuizMode();
    renderWaitingState();
    updateStartButton();
  }

  document.addEventListener('DOMContentLoaded', initQuiz);
})();
