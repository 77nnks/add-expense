import { ParsedMessage, EXPENSE_CATEGORIES, ExpenseCategory } from '../types';

/**
 * LINEメッセージを解析して支出データを抽出する
 *
 * 対応フォーマット:
 * - "食費 1000 ランチ"
 * - "交通費 500"
 * - "1500 食費 夕食"
 * - "コンビニ 300" (カテゴリ推測)
 */
export function parseExpenseMessage(message: string): ParsedMessage {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return { success: false, error: '空のメッセージです' };
  }

  // 金額を抽出 (数字のみ、またはカンマ区切り)
  const amountMatch = trimmedMessage.match(/[\d,]+/);
  if (!amountMatch) {
    return { success: false, error: '金額が見つかりません。例: 食費 1000 ランチ' };
  }

  const amount = parseInt(amountMatch[0].replace(/,/g, ''), 10);
  if (isNaN(amount) || amount <= 0) {
    return { success: false, error: '有効な金額を入力してください' };
  }

  // カテゴリを検出
  let category: ExpenseCategory = 'その他';
  for (const cat of EXPENSE_CATEGORIES) {
    if (trimmedMessage.includes(cat)) {
      category = cat;
      break;
    }
  }

  // キーワードからカテゴリを推測
  if (category === 'その他') {
    category = inferCategory(trimmedMessage);
  }

  // 説明を抽出 (金額とカテゴリを除いた残り)
  let description = trimmedMessage
    .replace(/[\d,]+/g, '')
    .replace(new RegExp(category, 'g'), '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!description) {
    description = category;
  }

  return {
    success: true,
    data: {
      amount,
      category,
      description,
      date: new Date(),
    },
  };
}

/**
 * キーワードからカテゴリを推測
 */
function inferCategory(message: string): ExpenseCategory {
  const categoryKeywords: Record<ExpenseCategory, string[]> = {
    '食費': ['ランチ', '夕食', '朝食', 'コンビニ', 'スーパー', '弁当', 'カフェ', 'コーヒー', '外食', 'レストラン'],
    '交通費': ['電車', 'バス', 'タクシー', 'ガソリン', '定期', '駐車'],
    '日用品': ['洗剤', 'シャンプー', 'ティッシュ', 'トイレットペーパー', '100均', 'ドラッグストア'],
    '娯楽': ['映画', 'ゲーム', '本', '漫画', 'ライブ', 'カラオケ', '飲み会'],
    '医療': ['病院', '薬局', '薬', '診察', '歯医者'],
    '衣服': ['服', '靴', 'アクセサリー', 'ユニクロ', 'GU'],
    '通信費': ['スマホ', '携帯', 'WiFi', 'インターネット'],
    '光熱費': ['電気', 'ガス', '水道'],
    '家賃': ['家賃', '賃貸', 'マンション'],
    'その他': [],
  };

  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        return cat as ExpenseCategory;
      }
    }
  }

  return 'その他';
}

/**
 * ヘルプメッセージを生成
 */
export function getHelpMessage(): string {
  return `【家計簿の使い方】

金額とカテゴリを入力してください。

📝 入力例:
・食費 1000 ランチ
・交通費 500 電車
・1500 コンビニ

📁 カテゴリ一覧:
${EXPENSE_CATEGORIES.join('、')}

💡 カテゴリを省略すると自動推測します`;
}
