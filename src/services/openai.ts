import OpenAI from 'openai';
import { config } from '../config';
import { DatabaseOptions, ExpenseData } from '../types';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

export interface AnalyzeResult {
  success: boolean;
  expenses?: ExpenseData[];
  error?: string;
}

/**
 * OpenAI GPT-4o を使用してレシート画像を解析
 */
export async function analyzeReceiptImage(
  imageBase64: string,
  options: DatabaseOptions
): Promise<AnalyzeResult> {
  const systemPrompt = `あなたは家計簿アプリのアシスタントです。レシートや領収書の画像から支出情報を抽出してください。
複数の商品がある場合でも、合計金額を1つの支出として登録してください。
ただし、明らかに別の店舗や別の日付のレシートが複数写っている場合は、それぞれを別の支出として登録してください。

## 利用可能なカテゴリー
${options.categories.join('、')}

## 利用可能な支出方法
${options.paymentMethods.join('、')}

## ルール
1. 合計金額を抽出してください。見つからない場合は商品の合計を計算してください。
2. 店名や購入内容から適切なカテゴリーを選んでください。該当がなければリストの最初の項目を使用。
3. 支払方法がレシートに記載されていればそれを使用、なければリストの最初の項目を使用。
4. 説明（支出項目）は店名や主な購入内容を簡潔に記載してください。
5. 画像が不鮮明でも、読み取れる情報から最善の推測をしてください。

## 出力形式
必ず以下のJSON形式で返してください：
{
  "success": true,
  "expenses": [
    {
      "amount": 数値,
      "category": "カテゴリー名",
      "paymentMethod": "支出方法名",
      "description": "店名や支出項目の説明"
    }
  ]
}

または、解析できない場合：
{
  "success": false,
  "error": "エラーメッセージ"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: 'このレシート画像から支出情報を抽出してください。',
            },
          ],
        },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, error: '画像分析に失敗しました' };
    }

    const result = JSON.parse(content);

    if (!result.success) {
      return { success: false, error: result.error || 'レシートを解析できませんでした' };
    }

    if (!Array.isArray(result.expenses) || result.expenses.length === 0) {
      return { success: false, error: 'レシートから支出情報が見つかりません' };
    }

    const expenses: ExpenseData[] = [];
    const now = new Date();

    for (const item of result.expenses) {
      if (typeof item.amount !== 'number' || item.amount <= 0) {
        continue;
      }

      const category = options.categories.includes(item.category)
        ? item.category
        : options.categories[0];

      const paymentMethod = options.paymentMethods.includes(item.paymentMethod)
        ? item.paymentMethod
        : options.paymentMethods[0];

      expenses.push({
        amount: item.amount,
        category,
        paymentMethod,
        description: item.description || category,
        date: now,
      });
    }

    if (expenses.length === 0) {
      return { success: false, error: '有効な支出情報が見つかりません' };
    }

    return { success: true, expenses };
  } catch (error) {
    console.error('OpenAI Vision API error:', error);
    return { success: false, error: '画像分析中にエラーが発生しました' };
  }
}

/**
 * OpenAI GPT-4o-mini を使用してメッセージを解析（複数支出対応）
 */
export async function analyzeExpenseMessage(
  message: string,
  options: DatabaseOptions
): Promise<AnalyzeResult> {
  const systemPrompt = `あなたは家計簿アプリのアシスタントです。ユーザーのメッセージから支出情報を抽出してください。
メッセージに複数の支出が含まれている場合は、すべて抽出してください。

## 利用可能なカテゴリー
${options.categories.join('、')}

## 利用可能な支出方法
${options.paymentMethods.join('、')}

## ルール
1. 金額は必須です。見つからない場合はエラーを返してください。
2. カテゴリーは上記リストから最も適切なものを選んでください。該当がなければリストの最初の項目を使用。
3. 支出方法も上記リストから選んでください。明示されていなければリストの最初の項目を使用。
4. 説明（支出項目）はメッセージから適切に抽出してください。
5. 複数の支出がある場合は、expenses配列に複数の項目を入れてください。

## 出力形式
必ず以下のJSON形式で返してください：
{
  "success": true,
  "expenses": [
    {
      "amount": 数値,
      "category": "カテゴリー名",
      "paymentMethod": "支出方法名",
      "description": "支出項目の説明"
    }
  ]
}

または、解析できない場合：
{
  "success": false,
  "error": "エラーメッセージ"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'AI分析に失敗しました' };
    }

    const result = JSON.parse(content);

    if (!result.success) {
      return { success: false, error: result.error || '解析できませんでした' };
    }

    if (!Array.isArray(result.expenses) || result.expenses.length === 0) {
      return { success: false, error: '支出情報が見つかりません' };
    }

    const expenses: ExpenseData[] = [];
    const now = new Date();

    for (const item of result.expenses) {
      // バリデーション
      if (typeof item.amount !== 'number' || item.amount <= 0) {
        continue;
      }

      // カテゴリーが利用可能なリストに含まれているか確認
      const category = options.categories.includes(item.category)
        ? item.category
        : options.categories[0];

      // 支出方法が利用可能なリストに含まれているか確認
      const paymentMethod = options.paymentMethods.includes(item.paymentMethod)
        ? item.paymentMethod
        : options.paymentMethods[0];

      expenses.push({
        amount: item.amount,
        category,
        paymentMethod,
        description: item.description || category,
        date: now,
      });
    }

    if (expenses.length === 0) {
      return { success: false, error: '有効な支出情報が見つかりません' };
    }

    return { success: true, expenses };
  } catch (error) {
    console.error('OpenAI API error:', error);
    return { success: false, error: 'AI分析中にエラーが発生しました' };
  }
}
