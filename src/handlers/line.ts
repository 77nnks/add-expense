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

  // AI分析で支出を解析
  const parsed = await analyzeExpenseMessage(userMessage, options);

  if (!parsed.success || !parsed.data) {
    await replyText(
      replyToken,
      `${parsed.error}\n\n「ヘルプ」と入力すると使い方を確認できます`
    );
    return;
  }

  try {
    await addExpenseToNotion(parsed.data);

    const response = [
      '✅ 登録しました',
      '',
      `📝 ${parsed.data.description}`,
      `💰 ${parsed.data.amount.toLocaleString()}円`,
      `📁 ${parsed.data.category}`,
      `💳 ${parsed.data.paymentMethod}`,
    ].join('\n');

    await replyText(replyToken, response);
  } catch (error) {
    console.error('Failed to add expense to Notion:', error);
    await replyText(replyToken, 'Notionへの登録に失敗しました。設定を確認してください。');
  }
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
