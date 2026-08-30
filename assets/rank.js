(function () {
  const scoreKey = 'htai-score';
  const levels = [
    {
      min: -Infinity,
      max: 50,
      command: 'ACH0',
      title: '航天新学员',
      desc: '解锁“神舟入门”。继续答题可以点亮更多主题。',
      tags: ['神舟入门']
    },
    {
      min: 60,
      max: 90,
      command: 'ACH1',
      title: '航天入门讲解员',
      desc: '已掌握基础航天知识，可以讲解神舟、天宫和火箭。',
      tags: ['神舟', '天宫', '火箭']
    },
    {
      min: 100,
      max: 140,
      command: 'ACH2',
      title: '航天小达人',
      desc: '已解锁深空探索内容，能介绍月球、火星和北斗。',
      tags: ['月球', '火星', '北斗']
    },
    {
      min: 150,
      max: Infinity,
      command: 'ACH3',
      title: '金牌航天讲解员',
      desc: '全主题解锁，可以展示完整航天科普合集。',
      tags: ['全主题', '航天合集']
    }
  ];

  function getAchievement(score) {
    return levels.find((item) => score >= item.min && score <= item.max) || levels[0];
  }

  function initRank() {
    const score = Number(localStorage.getItem(scoreKey) || 0);
    const achievement = getAchievement(score);

    window.App.$('#myScore').textContent = `${score} 分`;
    window.App.$('#achievementLevel').textContent = achievement.command;
    window.App.$('#achievementTitle').textContent = achievement.title;
    window.App.$('#achievementDesc').textContent = achievement.desc;
    window.App.$('#achievementTags').innerHTML = achievement.tags
      .map((tag) => `<span>${tag}</span>`)
      .join('');

    window.App.$('#syncAchievement').addEventListener('click', async () => {
      const sent = await window.App.sendCommand(achievement.command);
      if (sent) window.App.showToast(`已同步：${achievement.title}`);
    });
  }

  document.addEventListener('DOMContentLoaded', initRank);
})();
