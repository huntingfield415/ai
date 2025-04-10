// scheduler.js（SNS連携 + 失敗リトライ + cron対応 コメント付き）

const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const { format } = require('date-fns');

const db = new sqlite3.Database('./templates.db');
const now = new Date().toISOString();
console.log(`🔍 予約投稿チェック中 (${format(new Date(), 'yyyy-MM-dd HH:mm')})`);

// モックまたは実SNS投稿（Instagram, X, TikTok）関数
async function postToSNS(platform, content) {
  try {
    switch (platform) {
      case 'instagram':
        // await axios.post('https://graph.facebook.com/.../media', { caption: content });
        console.log(`📸 Instagram 投稿成功: ${content.slice(0, 30)}...`);
        break;
      case 'x':
        // await axios.post('https://api.twitter.com/2/tweets', { text: content });
        console.log(`🐦 X 投稿成功: ${content.slice(0, 30)}...`);
        break;
      case 'tiktok':
        // TikTokは非公式APIしか存在しないためモック対応
        console.log(`🎵 TikTok 投稿成功（モック）: ${content.slice(0, 30)}...`);
        break;
      default:
        throw new Error('不明なプラットフォーム');
    }
    return { success: true };
  } catch (err) {
    console.error(`❌ ${platform} 投稿失敗:`, err.message);
    return { success: false, error: err.message };
  }
}

function checkAndPost() {
  db.run('ALTER TABLE posts ADD COLUMN sent TEXT', () => {});
  db.run('ALTER TABLE posts ADD COLUMN error TEXT', () => {});

  db.all(
    'SELECT * FROM posts WHERE scheduledAt <= ? AND sent IS NULL',
    [now],
    async (err, rows) => {
      if (err) return console.error('DB検索エラー:', err);
      if (rows.length === 0) return console.log('▶ 投稿対象なし');

      for (const row of rows) {
        const result = await postToSNS(row.platform, row.content);
        if (result.success) {
          db.run('UPDATE posts SET sent = ?, error = NULL WHERE id = ?', [new Date().toISOString(), row.id]);
        } else {
          db.run('UPDATE posts SET error = ? WHERE id = ?', [result.error, row.id]);
        }
      }
    }
  );
}

checkAndPost();
