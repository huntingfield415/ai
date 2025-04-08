# SNS-MCP Template 🚀

SNS運用代行向けのChatGPT連携AIアシスタント（MCP）プロトタイプ。

## 💡 特徴

- クライアント別の投稿ルールをYAMLで管理
- ChatGPT APIと連携してSNS投稿案を自動生成
- X・Instagramに対応
- 管理画面はBootstrapでシンプルに

## 📦 使用技術

- Node.js + Express
- js-yaml
- OpenAI API
- Bootstrap 5

## 🔧 セットアップ

```bash
git clone https://github.com/huntingfield415/ai.git
cd ai
npm install
cp .env.example .env
# .env に OpenAI APIキーを記述
node server.js
```

## 🖥 フォルダ構成

```
sns-mcp-template/
├── public/           # フロントエンド（HTML + Bootstrap）
├── clients/          # クライアントごとのYAML設定
├── server.js         # Expressベースのバックエンド
├── .env.example      # 環境変数テンプレート
├── README.md         # このファイル
```

## ✨ 今後の拡張予定

- 投稿履歴の保存・分析
- SNS連携による予約投稿
- レポート自動生成MCPの追加
- Slack通知との連携
- GUIでのクライアント定義編集

## 📬 ライセンス

MIT License
