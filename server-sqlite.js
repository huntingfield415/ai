// server-sqlite.js（完全統合版：SNS投稿 + OAuth + 予約投稿 + アカウント管理）
require('dotenv').config();
const express = require('express');
const app = express();
const port = 3000;
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('docs'));

const db = new sqlite3.Database('templates.db');
const JWT_SECRET = process.env.JWT_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

//--------------------------------------------------
// SNSアカウント一覧 & 解除
//--------------------------------------------------
app.get('/api/accounts', (req, res) => {
  db.all('SELECT id, platform, user_id FROM accounts', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete('/api/accounts/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM accounts WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

//--------------------------------------------------
// 投稿登録 + 予約時刻付き保存
//--------------------------------------------------
app.post('/api/posts', (req, res) => {
  const { content, platform, scheduled_at } = req.body;
  db.run('INSERT INTO posts (content, platform, status, scheduled_at) VALUES (?, ?, ?, ?)',
    [content, platform, 'scheduled', scheduled_at],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

//--------------------------------------------------
// 投稿送信API（再送含む）
//--------------------------------------------------
app.post('/api/post/send', async (req, res) => {
  const { id, platform } = req.body;
  db.get('SELECT * FROM posts WHERE id = ?', [id], async (err, post) => {
    if (err || !post) return res.status(500).json({ error: '投稿が見つかりません' });
    try {
      const result = { success: true }; // ← SNS送信モック
      if (result.success) {
        db.run('UPDATE posts SET status = ?, posted_at = datetime("now") WHERE id = ?', ['posted', id]);
        db.run('INSERT INTO logs (post_id, platform, status, message, timestamp) VALUES (?, ?, ?, ?, datetime("now"))', [id, platform, 'success', '送信成功']);
        res.json({ success: true });
      } else {
        db.run('INSERT INTO logs (post_id, platform, status, message, timestamp) VALUES (?, ?, ?, ?, datetime("now"))', [id, platform, 'failure', '送信失敗']);
        res.status(500).json({ error: '送信失敗' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

//--------------------------------------------------
// 投稿ログ取得
//--------------------------------------------------
app.get('/api/logs', (req, res) => {
  db.all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

//--------------------------------------------------
// OpenAI 連携（投稿案生成）
//--------------------------------------------------
app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [ { role: 'user', content: prompt } ]
    }, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    res.json(response.data.choices[0].message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//--------------------------------------------------
// Instagram OAuth
//--------------------------------------------------
const INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
const INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;

app.get('/auth/instagram/start', (req, res) => {
  const url = `https://api.instagram.com/oauth/authorize?client_id=${INSTAGRAM_CLIENT_ID}&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}&scope=user_profile,user_media&response_type=code`;
  res.redirect(url);
});

app.get('/auth/instagram/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post('https://api.instagram.com/oauth/access_token', null, {
      params: {
        client_id: INSTAGRAM_CLIENT_ID,
        client_secret: INSTAGRAM_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: INSTAGRAM_REDIRECT_URI,
        code
      }
    });
    const access_token = tokenRes.data.access_token;
    const user_id = tokenRes.data.user_id;
    db.run('INSERT INTO accounts (platform, user_id, access_token) VALUES (?, ?, ?)', ['instagram', user_id, access_token]);
    res.send('Instagramアカウント連携が完了しました');
  } catch (err) {
    res.status(500).send('認証失敗');
  }
});

//--------------------------------------------------
// TikTok OAuth
//--------------------------------------------------
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

app.get('/auth/tiktok/start', (req, res) => {
  const url = `https://www.tiktok.com/v2/auth/authorize?client_key=${TIKTOK_CLIENT_KEY}&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&response_type=code&scope=user.info.basic,video.list`;
  res.redirect(url);
});

app.get('/auth/tiktok/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: TIKTOK_REDIRECT_URI
    });
    const access_token = tokenRes.data.access_token;
    const open_id = tokenRes.data.open_id;
    db.run('INSERT INTO accounts (platform, user_id, access_token) VALUES (?, ?, ?)', ['tiktok', open_id, access_token]);
    res.send('TikTokアカウント連携が完了しました');
  } catch (err) {
    res.status(500).send('TikTok認証失敗');
  }
});

//--------------------------------------------------
// X OAuth
//--------------------------------------------------
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI;

app.get('/auth/x/start', (req, res) => {
  const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(TWITTER_REDIRECT_URI)}&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=random123&code_challenge=challenge&code_challenge_method=plain`;
  res.redirect(url);
});

app.get('/auth/x/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post('https://api.twitter.com/2/oauth2/token', new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: TWITTER_CLIENT_ID,
      redirect_uri: TWITTER_REDIRECT_URI,
      code_verifier: 'challenge'
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: {
        username: TWITTER_CLIENT_ID,
        password: TWITTER_CLIENT_SECRET
      }
    });
    const access_token = tokenRes.data.access_token;
    db.run('INSERT INTO accounts (platform, user_id, access_token) VALUES (?, ?, ?)', ['x', 'twitter_user', access_token]);
    res.send('X アカウント連携が完了しました');
  } catch (err) {
    res.status(500).send('X認証失敗');
  }
});

//--------------------------------------------------
// cron: 予約投稿バッチ
//--------------------------------------------------
cron.schedule('* * * * *', () => {
  const now = new Date().toISOString();
  db.all('SELECT * FROM posts WHERE scheduled_at <= ? AND status = "scheduled"', [now], (err, rows) => {
    if (err) return;
    rows.forEach(row => {
      const platform = row.platform;
      const result = { success: true }; // SNS送信処理（モック）
      if (result.success) {
        db.run('UPDATE posts SET status = "posted", posted_at = datetime("now") WHERE id = ?', [row.id]);
        db.run('INSERT INTO logs (post_id, platform, status, message, timestamp) VALUES (?, ?, "success", "予約送信成功", datetime("now"))', [row.id, platform]);
      }
    });
  });
});

app.listen(port, () => {
  console.log(`\u{1F680} MCP統合サーバー http://localhost:${port}`);
});

//--------------------------------------------------
// 予約投稿一覧取得API（スケジュール一覧）
//--------------------------------------------------
app.get('/api/scheduled', (req, res) => {
  db.all('SELECT id, content, platform, scheduled_at FROM posts WHERE status = "scheduled" ORDER BY scheduled_at ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

//--------------------------------------------------
// サーバー起動
//--------------------------------------------------
app.listen(port, () => {
  console.log(`\u{1F680} MCP統合サーバー http://localhost:${port}`);
});

//--------------------------------------------------
// 予約投稿一覧取得API（スケジュール一覧）
//--------------------------------------------------
app.get('/api/scheduled', (req, res) => {
  db.all('SELECT id, content, platform, scheduled_at FROM posts WHERE status = "scheduled" ORDER BY scheduled_at ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

//--------------------------------------------------
// サーバー起動
//--------------------------------------------------
app.listen(port, () => {
  console.log(`\u{1F680} MCP統合サーバー http://localhost:${port}`);
});

//--------------------------------------------------
// 投稿ログのCSVエクスポート
//--------------------------------------------------
app.get('/api/logs/export', (req, res) => {
  db.all('SELECT * FROM logs ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const headers = ['id', 'post_id', 'platform', 'status', 'message', 'timestamp'];
    const csv = [headers.join(',')].concat(
      rows.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
    res.send(csv);
  });
});

//--------------------------------------------------
// サーバー起動
//--------------------------------------------------
app.listen(port, () => {
  console.log(`\u{1F680} MCP統合サーバー http://localhost:${port}`);
});

// 非公開投稿の設定処理（例: server-sqlite.js 側のAPI実装）
app.post('/api/posts', async (req, res) => {
  const { content, platform, scheduled_at, is_private } = req.body;
  try {
    await db.run(
      'INSERT INTO posts (content, platform, scheduled_at, status, is_private) VALUES (?, ?, ?, ?, ?)',
      [content, platform, scheduled_at, 'scheduled', is_private ? 1 : 0]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// フロントエンド例: フォームへのチェックボックス追加（mcp-generate.html など）
{/* <label class="flex items-center mt-2">
  <input type="checkbox" id="isPrivate" class="mr-2" />
  非公開として保存（下書き）
</label> */}

// 投稿送信JS（main.jsなど）に追加
const isPrivate = document.getElementById('isPrivate').checked;
const body = JSON.stringify({
  content, platform, scheduled_at, is_private: isPrivate
});
// 予約投稿テーブルに is_private カラムを追加するマイグレーション（初回のみ必要）
// 省略可: 既存テーブルに boolean カラムを追加

// POSTリクエストの例: /api/posts
app.post('/api/posts', (req, res) => {
  const { content, platform, scheduled_time, is_private } = req.body;
  const stmt = db.prepare(
    `INSERT INTO scheduled_posts (content, platform, scheduled_time, is_private) VALUES (?, ?, ?, ?)`
  );
  stmt.run(content, platform, scheduled_time, is_private ? 1 : 0);
  res.json({ success: true });
});

// GETリクエストに非公開フラグを含めて返却
app.get('/api/posts/scheduled', (req, res) => {
  const rows = db.prepare(`SELECT * FROM scheduled_posts`).all();
  res.json(rows);
});

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const PORT = 3000;
const db = new sqlite3.Database('./templates.db');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('docs'));

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

app.get('/api/templates', authenticateToken, (req, res) => {
  db.all('SELECT * FROM templates', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/templates', authenticateToken, (req, res) => {
  const { name, content, category, tags, is_private } = req.body;
  const stmt = db.prepare('INSERT INTO templates (name, content, category, tags, is_private) VALUES (?, ?, ?, ?, ?)');
  stmt.run(name, content, category, tags, is_private || 0, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID });
  });
});

app.put('/api/templates/:id', authenticateToken, (req, res) => {
  const { name, content, category, tags, is_private } = req.body;
  const stmt = db.prepare('UPDATE templates SET name = ?, content = ?, category = ?, tags = ?, is_private = ? WHERE id = ?');
  stmt.run(name, content, category, tags, is_private || 0, req.params.id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

app.delete('/api/templates/:id', authenticateToken, (req, res) => {
  const stmt = db.prepare('DELETE FROM templates WHERE id = ?');
  stmt.run(req.params.id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running with categories/tags API at http://localhost:${PORT}`);
});
