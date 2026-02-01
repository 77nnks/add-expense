# LINE to Notion 家計簿アプリ

LINEにメッセージを送信するだけで、Notionデータベースに支出を記録できるアプリです。

## 機能

- 📝 LINEメッセージから支出を自動解析・登録
- 📁 カテゴリの自動推測
- 💳 支出方法の自動推測
- 📊 今月の支出合計を確認
- 💬 シンプルな入力フォーマット

## 対応フォーマット

```
食費 1000 ランチ 現金      → カテゴリ: 食費, 金額: 1000円, 支出方法: 現金
交通費 500 Suica           → カテゴリ: 交通費, 金額: 500円, 支出方法: 電子マネー
1500 コンビニ PayPay       → カテゴリ: 食費(自動推測), 金額: 1500円, 支出方法: QR決済
```

## カテゴリ一覧

- 食費
- 交通費
- 日用品
- 娯楽
- 医療
- 衣服
- 通信費
- 光熱費
- 家賃
- その他

## 支出方法一覧

- 現金
- QR決済 (PayPay, LINE Pay, メルペイ, d払い, 楽天ペイ)
- クレジットカード
- 電子マネー (Suica, PASMO, nanaco, WAON, iD, QuicPay)
- 銀行振込
- その他

## コマンド

- `ヘルプ` または `help` - 使い方を表示
- `集計` または `今月` - 今月の支出合計を表示

## セットアップ

### 1. Notionデータベースの作成

以下のプロパティを持つデータベースを作成してください:

| プロパティ名 | タイプ | 説明 |
|-------------|--------|------|
| 支出項目    | Title  | 支出の説明 |
| 金額        | Number | 金額 |
| カテゴリー  | Select | 食費、交通費など |
| 日付        | Date   | 支出日 (例: 2026年2月1日) |
| 支出方法    | Select | 現金、QR決済など |

### 2. Notion APIの設定

1. [Notion Developers](https://www.notion.so/my-integrations) でインテグレーションを作成
2. 作成したデータベースにインテグレーションを接続
3. APIキーとデータベースIDを取得

### 3. LINE Messaging APIの設定

1. [LINE Developers](https://developers.line.biz/) でチャネルを作成
2. チャネルアクセストークンとチャネルシークレットを取得
3. Webhook URLを設定 (例: `https://your-domain.com/webhook`)

### 4. 環境変数の設定

`.env.example` をコピーして `.env` を作成:

```bash
cp .env.example .env
```

`.env` を編集:

```env
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=your_notion_database_id
PORT=3000
```

### 5. インストール・起動

```bash
# 依存関係のインストール
npm install

# ビルド
npm run build

# 起動
npm start

# 開発モード
npm run dev
```

## デプロイ (Railway)

### 1. Railwayプロジェクトの作成

1. [Railway](https://railway.app/) にログイン
2. 「New Project」→「Deploy from GitHub repo」を選択
3. このリポジトリを選択

### 2. 環境変数の設定

Railwayダッシュボードで以下の環境変数を設定:

| 変数名 | 説明 |
|--------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEチャネルアクセストークン |
| `LINE_CHANNEL_SECRET` | LINEチャネルシークレット |
| `NOTION_API_KEY` | Notion APIキー |
| `NOTION_DATABASE_ID` | NotionデータベースID |
| `PORT` | `3000` (Railwayが自動設定する場合は不要) |

### 3. デプロイ

環境変数を設定後、自動的にデプロイが開始されます。

### 4. Webhook URLの設定

1. Railwayダッシュボードで「Settings」→「Networking」→「Generate Domain」
2. 生成されたドメイン（例: `https://your-app.up.railway.app`）をコピー
3. LINE Developersで Webhook URL を設定: `https://your-app.up.railway.app/webhook`
4. 「Webhookの利用」をオンに設定

### ヘルスチェック

`/health` エンドポイントでアプリの稼働状況を確認できます。

---

## その他のデプロイ方法

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

## 技術スタック

- Node.js / TypeScript
- Express
- LINE Messaging API
- Notion API
