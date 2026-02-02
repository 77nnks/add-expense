# CLAUDE.md

このファイルはClaude Codeがプロジェクトを理解するためのドキュメントです。

## プロジェクト概要

LINE to Notion 家計簿アプリ - LINEメッセージから支出をAI（GPT-4o-mini）で自動解析してNotionデータベースに登録するWebhookサーバー

## 技術スタック

- **Runtime**: Node.js 18+
- **言語**: TypeScript
- **フレームワーク**: Express
- **外部API**:
  - LINE Messaging API (Webhook、リッチメニュー)
  - Notion API (データベース操作、選択肢取得)
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

scripts/
└── setup-richmenu.ts     # リッチメニュー設定スクリプト

assets/
└── richmenu.png          # リッチメニュー画像 (2500x843px)
```

## コマンド

```bash
npm install           # 依存関係インストール
npm run build         # TypeScript ビルド
npm start             # 本番起動 (dist/index.js)
npm run dev           # 開発モード (ts-node)
npm run typecheck     # 型チェック
npm run lint          # ESLint
npm run setup:richmenu  # リッチメニュー作成・設定
npm run delete:richmenu # リッチメニュー削除
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
| カテゴリー | Select | 食費、交通費など（選択肢はNotion側で設定） |
| 日付 | Date | 支出日 |
| 支出方法 | Select | 現金、QR決済など（選択肢はNotion側で設定） |

**重要**: カテゴリー・支出方法の選択肢はNotionデータベースで事前に追加する必要がある

## LINEコマンド

| コマンド | 説明 |
|----------|------|
| `ヘルプ` / `help` / `?` | 使い方を表示 |
| `集計` / `今月` | 今月の支出合計を表示 |
| `更新` / `reload` | Notion選択肢を再取得 |
| その他のメッセージ | AI解析して支出登録 |

## リッチメニュー

3ボタン構成（2500x843px）:
- ヘルプ: 使い方表示
- 集計: 今月の合計
- 更新: 選択肢再読み込み

## アーキテクチャ

```
LINE App → LINE Platform → Webhook → Express Server
                                         ↓
                                    Notion API (選択肢取得)
                                         ↓
                                    OpenAI API (自然言語解析)
                                         ↓
                                    Notion API (支出登録)
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
