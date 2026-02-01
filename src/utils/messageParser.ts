import {
  ParsedMessage,
  DatabaseOptions,
  CATEGORY_KEYWORDS,
  PAYMENT_KEYWORDS,
} from '../types';

/**
 * LINEメッセージを解析して支出データを抽出する
 *
 * 対応フォーマット:
 * - "食費 1000 ランチ 現金"
 * - "交通費 500 QR決済"
 * - "1500 食費 夕食"
 * - "コンビニ 300" (カテゴリ・支出方法を推測)
 */
export function parseExpenseMessage(
  message: string,
  options: DatabaseOptions
): ParsedMessage {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return { success: false, error: '空のメッセージです' };
  }

  // 金額を抽出 (数字のみ、またはカンマ区切り)
  const amountMatch = trimmedMessage.match(/[\d,]+/);
  if (!amountMatch) {
    return { success: false, error: '金額が見つかりません。例: 食費 1000 ランチ 現金' };
  }

  const amount = parseInt(amountMatch[0].replace(/,/g, ''), 10);
  if (isNaN(amount) || amount <= 0) {
    return { success: false, error: '有効な金額を入力してください' };
  }

  // カテゴリを検出 (NotionDBの選択肢から)
  let category = options.categories[0] || 'その他';
  for (const cat of options.categories) {
    if (trimmedMessage.includes(cat)) {
      category = cat;
      break;
    }
  }

  // キーワードからカテゴリを推測
  if (category === options.categories[0]) {
    const inferred = inferCategory(trimmedMessage, options.categories);
    if (inferred) {
      category = inferred;
    }
  }

  // 支出方法を検出 (NotionDBの選択肢から)
  let paymentMethod = options.paymentMethods[0] || '現金';
  for (const method of options.paymentMethods) {
    if (trimmedMessage.includes(method)) {
      paymentMethod = method;
      break;
    }
  }

  // キーワードから支出方法を推測
  if (paymentMethod === options.paymentMethods[0] && !trimmedMessage.includes(paymentMethod)) {
    const inferred = inferPaymentMethod(trimmedMessage, options.paymentMethods);
    if (inferred) {
      paymentMethod = inferred;
    }
  }

  // 説明を抽出 (金額、カテゴリ、支出方法を除いた残り)
  let description = trimmedMessage
    .replace(/[\d,]+/g, '')
    .replace(new RegExp(category, 'g'), '')
    .replace(new RegExp(paymentMethod, 'g'), '')
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
      paymentMethod,
    },
  };
}

/**
 * キーワードからカテゴリを推測
 */
function inferCategory(message: string, availableCategories: string[]): string | null {
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    // このカテゴリがNotionDBに存在するか確認
    if (!availableCategories.includes(cat)) {
      continue;
    }
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        return cat;
      }
    }
  }
  return null;
}

/**
 * キーワードから支出方法を推測
 */
function inferPaymentMethod(message: string, availableMethods: string[]): string | null {
  for (const [method, keywords] of Object.entries(PAYMENT_KEYWORDS)) {
    // この支出方法がNotionDBに存在するか確認
    if (!availableMethods.includes(method)) {
      continue;
    }
    for (const keyword of keywords) {
      if (message.toLowerCase().includes(keyword.toLowerCase())) {
        return method;
      }
    }
  }
  return null;
}

/**
 * ヘルプメッセージを生成
 */
export function getHelpMessage(options: DatabaseOptions): string {
  return `【家計簿の使い方】

金額・カテゴリ・支出方法を入力してください。

📝 入力例:
・食費 1000 ランチ 現金
・交通費 500 電車 Suica
・1500 コンビニ PayPay

📁 カテゴリ一覧:
${options.categories.join('、')}

💳 支出方法:
${options.paymentMethods.join('、')}

💡 省略すると自動推測します

🔄 「更新」で選択肢を再読み込み`;
}
