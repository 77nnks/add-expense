# LINE to Notion 家計簿アプリ

LINEにメッセージを送信するだけで、Notionデータベースに支出を記録できるアプリです。

## 機能

- 📝 LINEメッセージから支出を自動解析・登録
- 📁 カテゴリの自動推測
- 📊 今月の支出合計を確認
- 💬 シンプルな入力フォーマット

## 対応フォーマット

```
食費 1000 ランチ    → カテゴリ: 食費, 金額: 1000円, 説明: ランチ
交通費 500          → カテゴリ: 交通費, 金額: 500円
1500 コンビニ       → カテゴリ: 食費(自動推測), 金額: 1500円
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

## コマンド

- `ヘルプ` または `help` - 使い方を表示
- `集計` または `今月` - 今月の支出合計を表示

## セットアップ

### 1. Notionデータベースの作成

以下のプロパティを持つデータベースを作成してください:

| プロパティ名 | タイプ |
|-------------|--------|
| Name        | Title  |
| Amount      | Number |
| Category    | Select |
| Date        | Date   |

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

## デプロイ

### Render, Railway, Fly.ioなど

環境変数を設定し、ビルドコマンド `npm run build`、起動コマンド `npm start` を設定してください。

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
