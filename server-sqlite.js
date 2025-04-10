// server-sqlite.js - 最新版（JWT対応 + SQLiteテンプレート管理API）

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'your-secret-key';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'docs')));

const db = new sqlite3.Database('./templates.db');

// ==================== JWTミドルウェア ====================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// ==================== ログインAPI ====================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'password') {
    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
    return res.json({ token });
  }
  res.status(401).json({ message: 'Invalid credentials' });
});

// ==================== テンプレートAPI ====================
app.get('/api/templates', authenticateToken, (req, res) => {
  db.all('SELECT * FROM templates', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/templates', authenticateToken, (req, res) => {
  const { name, content, category, tags } = req.body;
  db.run(
    'INSERT INTO templates (name, content, category, tags) VALUES (?, ?, ?, ?)',
    [name, content, category, tags],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/templates/:id', authenticateToken, (req, res) => {
  const { name, content, category, tags } = req.body;
  const id = req.params.id;
  db.run(
    'UPDATE templates SET name = ?, content = ?, category = ?, tags = ? WHERE id = ?',
    [name, content, category, tags, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

app.delete('/api/templates/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM templates WHERE id = ?', id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ==================== カテゴリ・タグ取得API ====================
app.get('/api/categories', authenticateToken, (req, res) => {
  db.all('SELECT DISTINCT category FROM templates', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const categories = rows.map(row => row.category);
    res.json(categories);
  });
});

app.get('/api/tags', authenticateToken, (req, res) => {
  db.all('SELECT tags FROM templates', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const tagSet = new Set();
    rows.forEach(row => {
      row.tags.split(',').map(t => t.trim()).forEach(tag => {
        if (tag) tagSet.add(tag);
      });
    });
    res.json(Array.from(tagSet));
  });
});

// ==================== サーバー起動 ====================
app.listen(PORT, () => {
  console.log(`✅ Server running with categories/tags API at http://localhost:${PORT}`);
});
