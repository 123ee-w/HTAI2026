(function () {
  const scoreKey = 'htai-score';
  const wrongKey = 'htai-wrong-list';
  const rewardByLevel = {
    easy: 'QOK1',
    normal: 'QOK2',
    hard: 'QOK3'
  };

  let score = Number(localStorage.getItem(scoreKey) || 0);
  let level = 'easy';
  let current = null;
  let currentChoices = [];
  let answered = false;
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
        current = wrongList[Number(button.dataset.redo)];
        currentChoices = shuffle(current.options);
        answered = false;
        renderQuestion('正在重做错题。');
      });
    });
  }

  function nextQuestion() {
    const pool = questionsForLevel();
    current = pool[Math.floor(Math.random() * pool.length)];
    currentChoices = shuffle(current.options);
    answered = false;
    renderQuestion('新题来了，请选择答案。');
  }

  function renderQuestion(notice) {
    window.App.$('#questionText').textContent = current.q;
    const grid = window.App.$('#choiceGrid');
    grid.innerHTML = currentChoices.map((choice, index) => (
      `<button data-choice="${choice}" type="button">${String.fromCharCode(65 + index)}. ${choice}</button>`
    )).join('');
    window.App.$all('[data-choice]', grid).forEach((button) => {
      button.addEventListener('click', () => answer(button, button.dataset.choice));
    });
    window.App.$('#quizNotice').textContent = notice;
  }

  function answer(button, choice) {
    if (answered) return;
    answered = true;
    if (choice === current.a) {
      score += 10;
      button.classList.add('correct');
      wrongList = wrongList.filter((item) => item.q !== current.q);
      window.App.$('#quizNotice').textContent = '回答正确，积分 +10。';
      sendReward(rewardByLevel[level]);
    } else {
      score -= 10;
      button.classList.add('wrong');
      const rightButton = window.App.$all('[data-choice]').find((item) => item.dataset.choice === current.a);
      if (rightButton) rightButton.classList.add('correct');
      if (!wrongList.some((item) => item.q === current.q)) wrongList.push(current);
      window.App.$('#quizNotice').textContent = `回答错误，积分 -10。正确答案：${current.a}`;
      sendReward('QBAD');
    }
    renderScore();
    save();
    renderWrongList();
  }

  function speakQuestion() {
    if (!('speechSynthesis' in window)) {
      window.App.$('#quizNotice').textContent = '当前浏览器不支持朗读。';
      return;
    }
    window.speechSynthesis.cancel();
    const text = `${current.q}。选项：${currentChoices.join('，')}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
    window.App.$('#quizNotice').textContent = '正在朗读题目。';
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
    nextQuestion();
  }

  document.addEventListener('DOMContentLoaded', initQuiz);
})();
