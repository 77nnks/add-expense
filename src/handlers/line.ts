import { WebhookEvent, TextMessage, messagingApi } from '@line/bot-sdk';
import { config } from '../config';
import { getHelpMessage } from '../utils/messageParser';
import {
  addExpenseToNotion,
  getMonthlyTotal,
  getDatabaseOptions,
  clearOptionsCache,
} from '../services/notion';
import { analyzeExpenseMessage, analyzeReceiptImage } from '../services/openai';
import { ExpenseData, DatabaseOptions } from '../types';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.line.channelAccessToken,
});

const blobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.line.channelAccessToken,
});

/**
 * LINEイベントを処理
 */
export async function handleEvent(event: WebhookEvent): Promise<void> {
  if (event.type !== 'message') {
    return;
  }

  const { replyToken } = event;

  // NotionDBから選択肢を取得
  let options: DatabaseOptions;
  try {
    options = await getDatabaseOptions();
  } catch (error) {
    console.error('Failed to get database options:', error);
    await replyText(replyToken, 'Notionデータベースの取得に失敗しました。設定を確認してください。');
    return;
  }

  // 画像メッセージの処理
  if (event.message.type === 'image') {
    await handleImageMessage(event.message.id, replyToken, options);
    return;
  }

  // テキストメッセージ以外は無視
  if (event.message.type !== 'text') {
    return;
  }

  const userMessage = event.message.text;

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

  await registerExpenses(result.expenses, replyToken);
}

/**
 * 画像メッセージを処理
 */
async function handleImageMessage(
  messageId: string,
  replyToken: string,
  options: DatabaseOptions
): Promise<void> {
  try {
    // LINE APIから画像を取得
    const imageStream = await blobClient.getMessageContent(messageId);

    // ReadableStreamをBufferに変換
    const chunks: Buffer[] = [];
    for await (const chunk of imageStream) {
      chunks.push(Buffer.from(chunk));
    }
    const imageBuffer = Buffer.concat(chunks);
    const imageBase64 = imageBuffer.toString('base64');

    // OpenAI Vision APIで画像を分析
    const result = await analyzeReceiptImage(imageBase64, options);

    if (!result.success || !result.expenses || result.expenses.length === 0) {
      await replyText(
        replyToken,
        `📷 ${result.error}\n\nレシートの画像を送信するか、テキストで支出を入力してください`
      );
      return;
    }

    await registerExpenses(result.expenses, replyToken);
  } catch (error) {
    console.error('Failed to process image:', error);
    await replyText(replyToken, '画像の処理に失敗しました。もう一度お試しください。');
  }
}

/**
 * 支出を登録して結果を返信
 */
async function registerExpenses(
  expenses: ExpenseData[],
  replyToken: string
): Promise<void> {
  try {
    const registeredExpenses: ExpenseData[] = [];
    for (const expense of expenses) {
      await addExpenseToNotion(expense);
      registeredExpenses.push(expense);
    }

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
