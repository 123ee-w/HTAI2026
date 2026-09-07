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
  let level = 'easy';
  let current = null;
  let currentChoices = [];
  let answered = false;
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
    window.App.$('#scoreText').textContent = score;
    window.App.$('#correctText').textContent = `${totalCorrect} 题`;
    window.App.$('#wrongText').textContent = `${totalWrong} 题`;
    window.App.$('#levelText').textContent = level === 'hard' ? '挑战' : level === 'normal' ? '进阶' : '简单';
  }

  function applyCloudStats(stats, force = false) {
    if (!stats) return false;
    const cloudTime = Date.parse(stats.updatedAt || '') || 0;
    if (!force && cloudTime && cloudTime < lastStatsUpdatedAt) return false;
    score = Number(stats.score || 0);
    totalCorrect = Number(stats.correct || 0);
    totalWrong = Number(stats.wrong || 0);
    if (['easy', 'normal', 'hard'].includes(stats.level)) level = stats.level;
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

  function getCountdownSeconds() {
    return 5 + Math.floor(Math.random() * 6);
  }

  function startCountdown(seconds) {
    clearCountdown();
    window.App.sendCommand(`TIME_${seconds}`, { quiet: true });
    countdownRemaining = seconds;
    window.App.$('#quizNotice').textContent = `倒计时：${countdownRemaining} 秒`;
    countdownTimer = setInterval(() => {
      countdownRemaining -= 1;
      const notice = window.App.$('#quizNotice');
      if (countdownRemaining <= 0) {
        clearCountdown();
        notice.textContent = '时间到，本题关闭，准备下一题。';
        renderAnsweredState('时间到');
        clearAdvance();
        advanceTimer = setTimeout(nextQuestion, 1000);
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
        renderQuestion('正在重做错题。');
        startCountdown(getCountdownSeconds());
      });
    });
  }

  function nextQuestion() {
    clearAdvance();
    clearCountdown();
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
    startCountdown(getCountdownSeconds());
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
    window.App.$('#quizNotice').textContent = notice;
    const explain = window.App.$('#answerExplanation');
    explain.hidden = true;
    explain.textContent = '';
  }

  function renderAnsweredState(message) {
    window.App.$('#questionText').textContent = message;
    window.App.$all('[data-choice]').forEach((button) => {
      button.disabled = true;
    });
  }

  function selectChoice(choice) {
    if (!current || answered) return;
    answered = true;
    clearCountdown();
    clearAdvance();
    const buttons = window.App.$all('[data-choice]');
    if (choice === current.a) {
      score += 10;
      totalCorrect++;
      buttons.find((item) => item.dataset.choice === choice)?.classList.add('correct');
      wrongList = wrongList.filter((item) => item.q !== current.q);
      window.App.$('#quizNotice').textContent = '回答正确，积分 +10。';
      renderAnsweredState('回答正确');
      window.App.sendAnswerResult?.(true, level);
      const levelText = level === 'hard' ? '挑战难度' : level === 'normal' ? '中等难度' : '简单难度';
      sendTTS(`答对了，${levelText}`);
    } else {
      score -= 10;
      totalWrong++;
      buttons.find((item) => item.dataset.choice === choice)?.classList.add('wrong');
      buttons.find((item) => item.dataset.choice === current.a)?.classList.add('correct');
      if (!wrongList.some((item) => item.q === current.q)) wrongList.push(current);
      window.App.$('#quizNotice').textContent = `回答错误，积分 -10。正确答案：${current.a}`;
      renderAnsweredState('回答错误');
      window.App.sendAnswerResult?.(false, level);
      sendTTS('回答错误，扣十分');
    }
    renderScore();
    save();
    renderWrongList();
    showExplanation();
    advanceTimer = setTimeout(nextQuestion, 1500);
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

  function speakText(text, successText) {
    if (!('speechSynthesis' in window)) {
      window.App.$('#quizNotice').textContent = '当前浏览器不支持朗读。';
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
    window.App.$('#quizNotice').textContent = successText;
  }

  function speakQuestion() {
    if (!current) return;
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
    if (!letter || !current || answered) return;
    const index = letter.charCodeAt(0) - 65;
    const choice = currentChoices[index];
    if (choice) selectChoice(choice);
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
        level = button.dataset.level;
        window.App.$all('[data-level]').forEach((item) => item.classList.toggle('active', item === button));
        renderScore();
        nextQuestion();
        save();
      });
    });
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
    nextQuestion();
  }

  document.addEventListener('DOMContentLoaded', initQuiz);
})();
