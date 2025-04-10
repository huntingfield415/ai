// auth.js
const express = require('express');
const router = express.Router();

// 簡易ユーザーデータ（将来はDBに切り替え）
const users = [
  { username: 'admin', password: 'password', name: '管理者' }
];

// JWT認証（必要に応じて）
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_for_dev';

// Instagram認証開始（モック用ルート）
router.get('/instagram/start', (req, res) => {
  res.send('✅ Instagram認証フロー開始（モック）');
});

// Instagramコールバック（モック用）
router.get('/instagram/callback', (req, res) => {
  res.send('✅ Instagram認証コールバック（モック）');
});

// ログインAPI
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ message: '認証に失敗しました' });
  }

  const token = jwt.sign({ username: user.username, name: user.name }, JWT_SECRET, {
    expiresIn: '2h'
  });

  res.json({ token, username: user.username, name: user.name });
});

// トークン検証API（オプション：認証チェック用）
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'トークンが必要です' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (err) {
    res.status(401).json({ message: 'トークンが無効です' });
  }
});

module.exports = router;
