import { WebhookEvent, TextMessage, messagingApi } from '@line/bot-sdk';
import { config } from '../config';
import { getHelpMessage } from '../utils/messageParser';
import {
  addExpenseToNotion,
  getMonthlyTotal,
  getDatabaseOptions,
  clearOptionsCache,
} from '../services/notion';
import { analyzeExpenseMessage } from '../services/openai';
import { ExpenseData } from '../types';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.line.channelAccessToken,
});

/**
 * LINEイベントを処理
 */
export async function handleEvent(event: WebhookEvent): Promise<void> {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  const { replyToken } = event;
  const userMessage = event.message.text;

  // NotionDBから選択肢を取得
  let options;
  try {
    options = await getDatabaseOptions();
  } catch (error) {
    console.error('Failed to get database options:', error);
    await replyText(replyToken, 'Notionデータベースの取得に失敗しました。設定を確認してください。');
    return;
  }

  // ヘルプコマンド
  if (userMessage === 'ヘルプ' || userMessage === 'help' || userMessage === '?') {
    await replyText(replyToken, getHelpMessage(options));
    return;
  }

  // 更新コマンド（選択肢のキャッシュをクリア）
  if (userMessage === '更新' || userMessage === 'reload') {
    clearOptionsCache();
    try {
      const newOptions = await getDatabaseOptions();
      await replyText(
        replyToken,
        `🔄 選択肢を更新しました\n\n📁 カテゴリ:\n${newOptions.categories.join('、')}\n\n💳 支出方法:\n${newOptions.paymentMethods.join('、')}`
      );
    } catch (error) {
      console.error('Failed to reload options:', error);
      await replyText(replyToken, '選択肢の更新に失敗しました');
    }
    return;
  }

  // 今月の集計コマンド
  if (userMessage === '集計' || userMessage === '今月') {
    try {
      const total = await getMonthlyTotal();
      const now = new Date();
      await replyText(
        replyToken,
        `📊 ${now.getMonth() + 1}月の支出合計\n\n💰 ${total.toLocaleString()}円`
      );
    } catch (error) {
      console.error('Failed to get monthly total:', error);
      await replyText(replyToken, '集計の取得に失敗しました');
    }
    return;
  }

  // AI分析で支出を解析（複数対応）
  const result = await analyzeExpenseMessage(userMessage, options);

  if (!result.success || !result.expenses || result.expenses.length === 0) {
    await replyText(
      replyToken,
      `${result.error}\n\n「ヘルプ」と入力すると使い方を確認できます`
    );
    return;
  }

  try {
    // 複数の支出を登録
    const registeredExpenses: ExpenseData[] = [];
    for (const expense of result.expenses) {
      await addExpenseToNotion(expense);
      registeredExpenses.push(expense);
    }

    // 登録結果のメッセージを作成
    const response = buildResponseMessage(registeredExpenses);
    await replyText(replyToken, response);
  } catch (error) {
    console.error('Failed to add expense to Notion:', error);
    await replyText(replyToken, 'Notionへの登録に失敗しました。設定を確認してください。');
  }
}

/**
 * 登録結果のメッセージを作成
 */
function buildResponseMessage(expenses: ExpenseData[]): string {
  if (expenses.length === 1) {
    const e = expenses[0];
    return [
      '✅ 登録しました',
      '',
      `📝 ${e.description}`,
      `💰 ${e.amount.toLocaleString()}円`,
      `📁 ${e.category}`,
      `💳 ${e.paymentMethod}`,
    ].join('\n');
  }

  // 複数の支出の場合
  const lines = [`✅ ${expenses.length}件登録しました`, ''];

  let total = 0;
  for (const e of expenses) {
    lines.push(`・${e.description}: ${e.amount.toLocaleString()}円 (${e.category})`);
    total += e.amount;
  }

  lines.push('');
  lines.push(`💰 合計: ${total.toLocaleString()}円`);

  return lines.join('\n');
}

/**
 * テキストメッセージを返信
 */
async function replyText(replyToken: string, text: string): Promise<void> {
  const message: TextMessage = {
    type: 'text',
    text,
  };
  await client.replyMessage({
    replyToken,
    messages: [message],
  });
}
