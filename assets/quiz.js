(function () {
  const scoreKey = 'htai-score';
  const wrongKey = 'htai-wrong-list';
  const rewardByLevel = {
    easy: 'QOK1',
    normal: 'QOK2',
    hard: 'QOK3'
  };

  const params = new URLSearchParams(location.search);
  const hardwareMode = params.get('mode') === 'dati';

  let score = Number(localStorage.getItem(scoreKey) || 0);
  let level = 'easy';
  let current = null;
  let currentChoices = [];
  let answered = false;
  let countdownTimer = null;
  let countdownRemaining = 0;
  let advanceTimer = null;
  let usedQuestions = new Set();
  let wrongList = JSON.parse(localStorage.getItem(wrongKey) || '[]');

  function save() {
    localStorage.setItem(scoreKey, String(score));
    localStorage.setItem(wrongKey, JSON.stringify(wrongList));
  }

  function shuffle(list) {
    return [...list].sort(() => Math.random() - 0.5);
  }

  function questionsForLevel() {
    return window.AppData.quiz.filter((item) => item.level === level);
  }

  function renderScore() {
    window.App.$('#scoreText').textContent = score;
  }

  function sendReward(command) {
    window.App.sendCommand(command, { quiet: true }).then((sent) => {
      if (sent) window.App.showToast('硬件奖励已触发');
    });
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
        advanceTimer = setTimeout(nextQuestion, 1200);
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
    const unused = pool.filter((item) => !usedQuestions.has(item.q));
    if (!unused.length) usedQuestions.clear();
    const available = pool.filter((item) => !usedQuestions.has(item.q));
    current = available[Math.floor(Math.random() * available.length)];
    usedQuestions.add(current.q);
    currentChoices = shuffle(current.options);
    answered = false;
    renderQuestion(hardwareMode ? '请按掌控板 A/B/P/Y 选择答案。' : '新题来了，请选择答案。');
    startCountdown(getCountdownSeconds());
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
      buttons.find((item) => item.dataset.choice === choice)?.classList.add('correct');
      wrongList = wrongList.filter((item) => item.q !== current.q);
      window.App.$('#quizNotice').textContent = '回答正确，积分 +10。';
      renderAnsweredState('回答正确');
      sendReward(rewardByLevel[level]);
    } else {
      score -= 10;
      buttons.find((item) => item.dataset.choice === choice)?.classList.add('wrong');
      buttons.find((item) => item.dataset.choice === current.a)?.classList.add('correct');
      if (!wrongList.some((item) => item.q === current.q)) wrongList.push(current);
      window.App.$('#quizNotice').textContent = `回答错误，积分 -10。正确答案：${current.a}`;
      renderAnsweredState('回答错误');
      sendReward('QBAD');
    }
    renderScore();
    save();
    renderWrongList();
    showExplanation();
    advanceTimer = setTimeout(nextQuestion, 1800);
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
    speakText(
      `${current.q}。选项：${currentChoices.join('，')}`,
      '正在朗读题目。'
    );
  }

  function speakExplanation() {
    if (!current || !current.explain) {
      window.App.$('#quizNotice').textContent = '当前题目暂无讲解。';
      return;
    }
    speakText(current.explain, '正在朗读讲解。');
  }

  function handleHardwareAnswer(event) {
    const letter = event.detail?.letter;
    if (!letter || !current || answered) return;
    const index = letter.charCodeAt(0) - 65;
    const choice = currentChoices[index];
    if (choice) selectChoice(choice);
  }

  function initQuiz() {
    renderScore();
    renderWrongList();
    window.App.$all('[data-level]').forEach((button) => {
      button.addEventListener('click', () => {
        level = button.dataset.level;
        window.App.$all('[data-level]').forEach((item) => item.classList.toggle('active', item === button));
        nextQuestion();
      });
    });
    window.App.$('#nextQuestion').addEventListener('click', nextQuestion);
    window.App.$('#speakQuestion').addEventListener('click', speakQuestion);
    window.App.$('#speakExplain').addEventListener('click', speakExplanation);
    window.addEventListener('htai:answer', handleHardwareAnswer);
    nextQuestion();
  }

  document.addEventListener('DOMContentLoaded', initQuiz);
})();
