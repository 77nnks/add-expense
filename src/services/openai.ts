import OpenAI from 'openai';
import { config } from '../config';
import { DatabaseOptions, ParsedMessage } from '../types';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

/**
 * OpenAI GPT-4o-mini を使用してメッセージを解析
 */
export async function analyzeExpenseMessage(
  message: string,
  options: DatabaseOptions
): Promise<ParsedMessage> {
  const systemPrompt = `あなたは家計簿アプリのアシスタントです。ユーザーのメッセージから支出情報を抽出してください。

## 利用可能なカテゴリー
${options.categories.join('、')}

## 利用可能な支出方法
${options.paymentMethods.join('、')}

## ルール
1. 金額は必須です。見つからない場合はエラーを返してください。
2. カテゴリーは上記リストから最も適切なものを選んでください。該当がなければリストの最初の項目を使用。
3. 支出方法も上記リストから選んでください。明示されていなければリストの最初の項目を使用。
4. 説明（支出項目）はメッセージから適切に抽出してください。

## 出力形式
必ず以下のJSON形式で返してください：
{
  "success": true,
  "amount": 数値,
  "category": "カテゴリー名",
  "paymentMethod": "支出方法名",
  "description": "支出項目の説明"
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

    // バリデーション
    if (typeof result.amount !== 'number' || result.amount <= 0) {
      return { success: false, error: '有効な金額が見つかりません' };
    }

    // カテゴリーが利用可能なリストに含まれているか確認
    const category = options.categories.includes(result.category)
      ? result.category
      : options.categories[0];

    // 支出方法が利用可能なリストに含まれているか確認
    const paymentMethod = options.paymentMethods.includes(result.paymentMethod)
      ? result.paymentMethod
      : options.paymentMethods[0];

    return {
      success: true,
      data: {
        amount: result.amount,
        category,
        paymentMethod,
        description: result.description || category,
        date: new Date(),
      },
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    return { success: false, error: 'AI分析中にエラーが発生しました' };
  }
}
