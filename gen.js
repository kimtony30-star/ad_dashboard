const fs = require('fs');

const dataRaw = fs.readFileSync('브라이언_data.json', 'utf8');
const data = JSON.parse(dataRaw);
const name = data.name || '멤버';
const member_url = data.member_url || '#';
const badges = data.badges || [];
const post_count = data.post_count || 0;
const reply_count = data.reply_count || 0;
const total_likes = data.total_likes || 0;
const total_comments = data.total_comments || 0;
const categories = data.categories || {};
const monthly_activity = data.monthly_activity || {};
const posts = data.posts || [];
const tools = data.tools || [];
const stats = data.stats || {
  consistency: 80,
  content_creation: 80,
  practical_implementation: 80,
  ai_tool_diversity: 80,
  community_contribution: 80,
  study_participation: 80,
};
const summary = data.summary || `${name}님의 GPTers 활동 분석`;
const activity_period = data.activity_period || '알 수 없음';

const categories_json = JSON.stringify(categories);
const monthly_json = JSON.stringify(monthly_activity);
const posts_json = JSON.stringify(posts);
const stats_json = JSON.stringify(stats);
const tools_json = JSON.stringify(tools);
const badges_html = badges.map(b => `<span class="badge">${b}</span>`).join('');

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name} | GPTers 활동 분석</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  :root {
    --primary: #6366f1;
    --primary-light: #818cf8;
    --bg: #0f0f1a;
    --card: #1a1a2e;
    --card2: #16213e;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --border: #2d2d4e;
    --accent: #f472b6;
    --green: #34d399;
    --yellow: #fbbf24;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; min-height: 100vh; }
  .hero { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%); padding: 60px 20px 40px; text-align: center; position: relative; overflow: hidden; }
  .hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 30% 50%, rgba(99,102,241,0.3) 0%, transparent 60%), radial-gradient(circle at 70% 50%, rgba(244,114,182,0.2) 0%, transparent 60%); }
  .hero-content { position: relative; z-index: 1; }
  .avatar { width: 90px; height: 90px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--accent)); display: flex; align-items: center; justify-content: center; font-size: 2.2rem; margin: 0 auto 16px; border: 3px solid rgba(255,255,255,0.2); }
  .hero h1 { font-size: 2rem; font-weight: 700; margin-bottom: 8px; }
  .hero h1 a { color: var(--primary-light); text-decoration: none; }
  .hero h1 a:hover { text-decoration: underline; }
  .hero p { color: var(--muted); font-size: 1rem; max-width: 500px; margin: 0 auto 16px; }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
  .badge { background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.4); color: var(--primary-light); padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; }
  .container { max-width: 1100px; margin: 0 auto; padding: 32px 20px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; text-align: center; transition: transform 0.2s; }
  .stat-card:hover { transform: translateY(-3px); }
  .stat-card .value { font-size: 2rem; font-weight: 700; color: var(--primary-light); }
  .stat-card .label { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }
  @media (max-width: 700px) { .charts-grid { grid-template-columns: 1fr; } }
  .chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
  .chart-card h3 { font-size: 1rem; color: var(--muted); margin-bottom: 16px; font-weight: 600; }
  .chart-card.full { grid-column: 1 / -1; }
  .posts-section { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 32px; }
  .posts-section h3 { font-size: 1.1rem; margin-bottom: 16px; color: var(--text); }
  .post-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .post-item:last-child { border-bottom: none; }
  .post-rank { color: var(--muted); font-size: 0.85rem; width: 24px; flex-shrink: 0; }
  .post-title { flex: 1; font-size: 0.9rem; color: var(--text); }
  .post-meta { display: flex; gap: 8px; flex-shrink: 0; }
  .post-meta span { font-size: 0.8rem; color: var(--muted); }
  .post-meta .likes { color: var(--accent); }
  .tools-section { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 32px; }
  .tools-section h3 { font-size: 1.1rem; margin-bottom: 16px; }
  .tools-cloud { display: flex; flex-wrap: wrap; gap: 10px; }
  .tool-tag { background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.3); color: var(--green); padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; }
  .footer { text-align: center; color: var(--muted); font-size: 0.8rem; padding: 24px; }
  canvas { max-height: 280px; }
</style>
</head>
<body>

<div class="hero">
  <div class="hero-content">
    <div class="avatar">🧑‍💻</div>
    <h1><a href="${member_url}" target="_blank">${name}</a></h1>
    <p>${summary}</p>
    <div class="badges">${badges_html}</div>
  </div>
</div>

<div class="container">
  <!-- 핵심 스탯 -->
  <div class="stats-grid" id="statsGrid"></div>

  <!-- 차트 그리드 -->
  <div class="charts-grid">
    <div class="chart-card">
      <h3>⚡ 역량 레이더</h3>
      <canvas id="radarChart"></canvas>
    </div>
    <div class="chart-card">
      <h3>📂 카테고리 분포</h3>
      <canvas id="donutChart"></canvas>
    </div>
    <div class="chart-card full">
      <h3>📅 월별 활동량</h3>
      <canvas id="barChart"></canvas>
    </div>
    <div class="chart-card full">
      <h3>❤️ 게시물별 좋아요</h3>
      <canvas id="likesChart"></canvas>
    </div>
  </div>

  <!-- 게시물 목록 -->
  <div class="posts-section">
    <h3>📝 전체 게시물</h3>
    <div id="postsList"></div>
  </div>

  <!-- 사용 도구 -->
  <div class="tools-section">
    <h3>🛠️ 주요 사용 AI 도구</h3>
    <div class="tools-cloud" id="toolsCloud"></div>
  </div>
</div>

<div class="footer">GPTers 멤버 활동 분석 · 활동 기간: ${activity_period}</div>

<script>
const STATS_DATA = {
  post_count: ${post_count},
  reply_count: ${reply_count},
  total_likes: ${total_likes},
  total_comments: ${total_comments},
  activity_period: "${activity_period}"
};
const CATEGORIES = ${categories_json};
const MONTHLY = ${monthly_json};
const POSTS = ${posts_json};
const RADAR_STATS = ${stats_json};
const TOOLS = ${tools_json};

// 핵심 스탯 카드
const statsGrid = document.getElementById('statsGrid');
const statItems = [
  { label: '총 게시물', value: STATS_DATA.post_count, color: '#818cf8' },
  { label: '작성 답변', value: STATS_DATA.reply_count, color: '#f472b6' },
  { label: '받은 좋아요', value: STATS_DATA.total_likes, color: '#fbbf24' },
  { label: '받은 댓글', value: STATS_DATA.total_comments, color: '#34d399' },
  { label: '활동 기간', value: STATS_DATA.activity_period, color: '#60a5fa' },
];
statItems.forEach(s => {
  statsGrid.innerHTML += \`<div class="stat-card"><div class="value" style="color:\${s.color}">\${s.value}</div><div class="label">\${s.label}</div></div>\`;
});

// 공통 Chart.js 옵션
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#2d2d4e';

// 레이더 차트
const radarLabels = ['꾸준함', '콘텐츠 생산력', '실전 구현력', 'AI 툴 다양성', '커뮤니티 기여도', '스터디 참여도'];
const radarValues = [
  RADAR_STATS.consistency || 80,
  RADAR_STATS.content_creation || 80,
  RADAR_STATS.practical_implementation || 80,
  RADAR_STATS.ai_tool_diversity || 80,
  RADAR_STATS.community_contribution || 80,
  RADAR_STATS.study_participation || 80,
];
new Chart(document.getElementById('radarChart'), {
  type: 'radar',
  data: {
    labels: radarLabels,
    datasets: [{ label: '역량 스탯', data: radarValues, backgroundColor: 'rgba(99,102,241,0.25)', borderColor: '#818cf8', pointBackgroundColor: '#818cf8', pointRadius: 4 }]
  },
  options: { scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 }, grid: { color: '#2d2d4e' }, angleLines: { color: '#2d2d4e' } } }, plugins: { legend: { display: false } } }
});

// 도넛 차트
const catLabels = Object.keys(CATEGORIES);
const catValues = Object.values(CATEGORIES);
const catColors = ['#818cf8','#f472b6','#34d399','#fbbf24','#60a5fa','#a78bfa','#fb923c','#2dd4bf'];
new Chart(document.getElementById('donutChart'), {
  type: 'doughnut',
  data: { labels: catLabels, datasets: [{ data: catValues, backgroundColor: catColors.slice(0, catLabels.length), borderWidth: 2, borderColor: '#1a1a2e' }] },
  options: { plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } } } }
});

// 월별 바 차트
const months = Object.keys(MONTHLY);
const monthVals = Object.values(MONTHLY);
new Chart(document.getElementById('barChart'), {
  type: 'bar',
  data: { labels: months, datasets: [{ label: '게시물 수', data: monthVals, backgroundColor: 'rgba(99,102,241,0.7)', borderColor: '#818cf8', borderWidth: 1, borderRadius: 6 }] },
  options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
});

// 좋아요 수평 바 차트
const topPosts = [...POSTS].sort((a,b) => (b.likes||0)-(a.likes||0)).slice(0, 10);
new Chart(document.getElementById('likesChart'), {
  type: 'bar',
  data: {
    labels: topPosts.map(p => p.title ? (p.title.length > 35 ? p.title.slice(0,35)+'…' : p.title) : '(제목 없음)'),
    datasets: [{ label: '좋아요', data: topPosts.map(p => p.likes||0), backgroundColor: 'rgba(244,114,182,0.7)', borderColor: '#f472b6', borderWidth: 1, borderRadius: 6 }]
  },
  options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
});

// 게시물 목록
const postsList = document.getElementById('postsList');
POSTS.forEach((p, i) => {
  postsList.innerHTML += \`
    <div class="post-item">
      <span class="post-rank">#\${i+1}</span>
      <span class="post-title">\${p.title || '(제목 없음)'}</span>
      <div class="post-meta">
        <span class="likes">❤️ \${p.likes||0}</span>
        <span>💬 \${p.comments||0}</span>
        \${p.date ? \`<span>\${p.date}</span>\` : ''}
      </div>
    </div>\`;
});

// 도구 클라우드
const toolsCloud = document.getElementById('toolsCloud');
TOOLS.forEach(t => {
  toolsCloud.innerHTML += \`<span class="tool-tag">\${t}</span>\`;
});
</script>
</body>
</html>`;

fs.writeFileSync('브라이언_profile.html', html, 'utf8');
console.log('Successfully written 브라이언_profile.html');
