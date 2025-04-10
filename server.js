// server.js（投稿案生成 + テンプレート管理API 統合版）
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'templates.json');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- テンプレートデータ管理関数 ---
function loadTemplates() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE));
}
function saveTemplates(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- 投稿案生成 ---
app.post('/generate', async (req, res) => {
  const { client, input } = req.body;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `${client} 向けのSNS投稿案を考えるAIです。出力は日本語で、140文字以内、絵文字も使ってください。`,
        },
        {
          role: 'user',
          content: input,
        }
      ]
    });
    const output = response.choices[0].message.content;
    res.json({ output });
  } catch (err) {
    console.error('OpenAI API エラー:', err.message);
    res.status(500).json({ error: '生成に失敗しました' });
  }
});

// --- テンプレートAPI ---
app.get('/templates', (req, res) => {
  res.json(loadTemplates());
});

app.post('/templates', (req, res) => {
  const templates = loadTemplates();
  const { name, content } = req.body;
  const id = Date.now();
  templates.push({ id, name, content });
  saveTemplates(templates);
  res.status(201).json({ id });
});

app.put('/templates/:id', (req, res) => {
  const templates = loadTemplates();
  const id = parseInt(req.params.id);
  const { name, content } = req.body;
  const updated = templates.map(t => t.id === id ? { ...t, name, content } : t);
  saveTemplates(updated);
  res.json({ status: 'updated' });
});

app.delete('/templates/:id', (req, res) => {
  const templates = loadTemplates();
  const id = parseInt(req.params.id);
  const filtered = templates.filter(t => t.id !== id);
  saveTemplates(filtered);
  res.json({ status: 'deleted' });
});

// --- サーバー起動 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ サーバー起動: http://localhost:${PORT}`);
});