import { WebhookEvent, TextMessage, messagingApi } from '@line/bot-sdk';
import { config } from '../config';
import { getHelpMessage } from '../utils/messageParser';
import {
  addExpenseToNotion,
  getMonthlyTotal,
  getDatabaseOptions,
  clearOptionsCache,
  setUserLastExpense,
  getUserLastExpense,
  updateExpense,
  deleteExpense,
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
  const userId = 'userId' in event.source ? event.source.userId : undefined;

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
    await handleImageMessage(event.message.id, replyToken, options, userId);
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

  // 取消・削除コマンド
  if (userMessage === '取消' || userMessage === '削除') {
    await handleDeleteCommand(replyToken, userId);
    return;
  }

  // 修正コマンド
  if (userMessage.startsWith('修正')) {
    await handleModifyCommand(userMessage, replyToken, options, userId);
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

  await registerExpenses(result.expenses, replyToken, userId);
}

/**
 * 画像メッセージを処理
 */
async function handleImageMessage(
  messageId: string,
  replyToken: string,
  options: DatabaseOptions,
  userId?: string
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

    await registerExpenses(result.expenses, replyToken, userId);
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
  replyToken: string,
  userId?: string
): Promise<void> {
  try {
    const registeredExpenses: ExpenseData[] = [];
    const pageIds: string[] = [];

    for (const expense of expenses) {
      const pageId = await addExpenseToNotion(expense);
      registeredExpenses.push(expense);
      pageIds.push(pageId);
    }

    // ユーザーの直近の登録を保存
    if (userId) {
      setUserLastExpense(userId, pageIds);
    }

    const response = buildResponseMessage(registeredExpenses);
    await replyText(replyToken, response);
  } catch (error) {
    console.error('Failed to add expense to Notion:', error);
    await replyText(replyToken, 'Notionへの登録に失敗しました。設定を確認してください。');
  }
}

/**
 * 削除コマンドを処理
 */
async function handleDeleteCommand(
  replyToken: string,
  userId?: string
): Promise<void> {
  if (!userId) {
    await replyText(replyToken, '削除できません。ユーザー情報が取得できませんでした。');
    return;
  }

  const pageIds = getUserLastExpense(userId);
  if (!pageIds || pageIds.length === 0) {
    await replyText(replyToken, '削除する支出がありません。');
    return;
  }

  try {
    for (const pageId of pageIds) {
      await deleteExpense(pageId);
    }
    setUserLastExpense(userId, []); // 削除後はクリア

    const countText = pageIds.length > 1 ? `${pageIds.length}件の` : '';
    await replyText(replyToken, `🗑️ ${countText}直近の登録を削除しました`);
  } catch (error) {
    console.error('Failed to delete expense:', error);
    await replyText(replyToken, '削除に失敗しました。');
  }
}

/**
 * 修正コマンドを処理
 * 書式: 修正 [項目] [値]
 * 例: 修正 カテゴリー 交通費
 */
async function handleModifyCommand(
  message: string,
  replyToken: string,
  options: DatabaseOptions,
  userId?: string
): Promise<void> {
  if (!userId) {
    await replyText(replyToken, '修正できません。ユーザー情報が取得できませんでした。');
    return;
  }

  const pageIds = getUserLastExpense(userId);
  if (!pageIds || pageIds.length === 0) {
    await replyText(replyToken, '修正する支出がありません。');
    return;
  }

  // コマンドをパース: "修正 項目 値"
  const parts = message.split(/\s+/);
  if (parts.length < 3) {
    await replyText(
      replyToken,
      '修正の書式: 修正 [項目] [値]\n\n' +
        '項目:\n' +
        '・カテゴリー\n' +
        '・支出方法\n' +
        '・金額\n' +
        '・項目（説明）\n\n' +
        '例: 修正 カテゴリー 交通費'
    );
    return;
  }

  const field = parts[1];
  const value = parts.slice(2).join(' ');

  try {
    const updates: Partial<ExpenseData> = {};

    switch (field) {
      case 'カテゴリー':
      case 'カテゴリ':
        if (!options.categories.includes(value)) {
          await replyText(
            replyToken,
            `「${value}」は無効なカテゴリーです。\n\n利用可能: ${options.categories.join('、')}`
          );
          return;
        }
        updates.category = value;
        break;

      case '支出方法':
      case '支払方法':
        if (!options.paymentMethods.includes(value)) {
          await replyText(
            replyToken,
            `「${value}」は無効な支出方法です。\n\n利用可能: ${options.paymentMethods.join('、')}`
          );
          return;
        }
        updates.paymentMethod = value;
        break;

      case '金額':
        const amount = parseInt(value.replace(/[,円]/g, ''), 10);
        if (isNaN(amount) || amount <= 0) {
          await replyText(replyToken, '金額は正の数値で入力してください。');
          return;
        }
        updates.amount = amount;
        break;

      case '項目':
      case '説明':
        updates.description = value;
        break;

      default:
        await replyText(
          replyToken,
          `「${field}」は修正できない項目です。\n\n修正可能: カテゴリー、支出方法、金額、項目`
        );
        return;
    }

    // 全ての直近登録を更新
    for (const pageId of pageIds) {
      await updateExpense(pageId, updates);
    }

    const countText = pageIds.length > 1 ? `${pageIds.length}件の` : '';
    await replyText(replyToken, `✏️ ${countText}${field}を「${value}」に修正しました`);
  } catch (error) {
    console.error('Failed to update expense:', error);
    await replyText(replyToken, '修正に失敗しました。');
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
