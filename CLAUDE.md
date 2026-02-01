# CLAUDE.md

このファイルはClaude Codeがプロジェクトを理解するためのドキュメントです。

## プロジェクト概要

LINE to Notion 家計簿アプリ - LINEメッセージから支出を自動解析してNotionデータベースに登録するWebhookサーバー

## 技術スタック

- **Runtime**: Node.js 18+
- **言語**: TypeScript
- **フレームワーク**: Express
- **外部API**:
  - LINE Messaging API (Webhook)
  - Notion API (データベース操作)
  - OpenAI API (GPT-4o-mini による自然言語解析)

## ディレクトリ構成

```
src/
├── index.ts              # エントリーポイント (Express サーバー)
├── config/index.ts       # 環境変数の設定
├── handlers/line.ts      # LINE Webhook ハンドラー
├── services/
│   ├── notion.ts         # Notion API 操作
│   └── openai.ts         # OpenAI API による解析
├── utils/messageParser.ts # ヘルプメッセージ生成
└── types/index.ts        # 型定義
```

## コマンド

```bash
npm install      # 依存関係インストール
npm run build    # TypeScript ビルド
npm start        # 本番起動 (dist/index.js)
npm run dev      # 開発モード (ts-node)
npm run typecheck # 型チェック
npm run lint     # ESLint
```

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE チャネルアクセストークン |
| `LINE_CHANNEL_SECRET` | LINE チャネルシークレット |
| `NOTION_API_KEY` | Notion API キー |
| `NOTION_DATABASE_ID` | Notion データベース ID |
| `OPENAI_API_KEY` | OpenAI API キー |
| `PORT` | サーバーポート (デフォルト: 3000) |

## Notion データベース構成

| プロパティ名 | タイプ | 説明 |
|-------------|--------|------|
| 支出項目 | Title | 支出の説明 |
| 金額 | Number | 金額 |
| カテゴリー | Select | 食費、交通費など |
| 日付 | Date | 支出日 |
| 支出方法 | Select | 現金、QR決済など |

## アーキテクチャ

```
LINE App → LINE Platform → Webhook → Express Server
                                         ↓
                                    OpenAI API (解析)
                                         ↓
                                    Notion API (登録)
                                         ↓
                                    LINE Reply (結果通知)
```

## コーディング規約

- 日本語コメント可
- 関数には JSDoc コメントを付ける
- 型は `src/types/index.ts` に集約
- 環境変数は `src/config/index.ts` で管理
- API エラーは適切にキャッチして LINE に通知

## デプロイ

- **Railway** を使用
- GitHub 連携で自動デプロイ
- 環境変数は Railway ダッシュボードで管理
