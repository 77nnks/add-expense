import { WebhookEvent, TextMessage, QuickReply, messagingApi } from '@line/bot-sdk';
import { config } from '../config';
import { getHelpMessage } from '../utils/messageParser';
import {
  addExpenseToNotion,
  getMultiMonthTotals,
  getCategoryBreakdown,
  getDatabaseOptions,
  clearOptionsCache,
  setUserLastExpense,
  getUserLastExpense,
  updateExpense,
  deleteExpense,
  getExpenseById,
  getUserState,
  setUserState,
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

  // ユーザーの操作状態をチェック
  if (userId) {
    const userState = getUserState(userId);
    if (userState) {
      // 操作キャンセル
      if (userMessage === 'キャンセル') {
        setUserState(userId, null);
        await replyText(replyToken, '操作をキャンセルしました');
        return;
      }

      // 削除確認待ち
      if (userState.action === 'confirmDelete') {
        if (userMessage === '取消を確定') {
          await executeDelete(replyToken, userId);
        } else {
          setUserState(userId, null);
          await replyText(replyToken, '取消をキャンセルしました');
        }
        return;
      }

      // 修正項目選択待ち
      if (userState.action === 'waitingModifyField') {
        const validFields = ['カテゴリー', '支出方法', '金額', '支出項目'];
        if (validFields.includes(userMessage)) {
          setUserState(userId, { action: 'waitingModifyValue', field: userMessage });

          // カテゴリー・支出方法は選択肢をボタンで表示
          console.log('[DEBUG] options.categories:', JSON.stringify(options.categories));
          console.log('[DEBUG] options.paymentMethods:', JSON.stringify(options.paymentMethods));
          if (userMessage === 'カテゴリー') {
            const categoryItems = options.categories
              .filter((cat) => cat && cat.length > 0)
              .slice(0, 12)
              .map((cat) => ({
                type: 'action' as const,
                action: {
                  type: 'message' as const,
                  label: cat.length > 20 ? cat.substring(0, 20) : cat,
                  text: cat,
                },
              }));
            console.log('[DEBUG] categoryItems before cancel:', JSON.stringify(categoryItems));
            const items: QuickReply['items'] = [
              ...categoryItems,
              { type: 'action', action: { type: 'message', label: '❌ キャンセル', text: 'キャンセル' } },
            ];
            console.log('[DEBUG] Final items count:', items.length);
            await replyTextWithQuickReply(replyToken, '新しいカテゴリーを選択してください', items);
          } else if (userMessage === '支出方法') {
            const paymentItems = options.paymentMethods
              .filter((pm) => pm && pm.length > 0)
              .slice(0, 12)
              .map((pm) => ({
                type: 'action' as const,
                action: {
                  type: 'message' as const,
                  label: pm.length > 20 ? pm.substring(0, 20) : pm,
                  text: pm,
                },
              }));
            console.log('[DEBUG] paymentItems before cancel:', JSON.stringify(paymentItems));
            const items: QuickReply['items'] = [
              ...paymentItems,
              { type: 'action', action: { type: 'message', label: '❌ キャンセル', text: 'キャンセル' } },
            ];
            console.log('[DEBUG] Final items count:', items.length);
            await replyTextWithQuickReply(replyToken, '新しい支出方法を選択してください', items);
          } else {
            // 金額・支出項目はテキスト入力
            await replyTextWithQuickReply(
              replyToken,
              `${userMessage}の新しい値を入力してください`,
              [{ type: 'action', action: { type: 'message', label: '❌ キャンセル', text: 'キャンセル' } }]
            );
          }
        } else {
          setUserState(userId, null);
          await replyText(replyToken, '修正をキャンセルしました');
        }
        return;
      }

      // 修正値入力待ち
      if (userState.action === 'waitingModifyValue' && userState.field) {
        await executeModify(replyToken, userId, userState.field, userMessage, options);
        return;
      }
    }
  }

  // ヘルプコマンド
  if (userMessage === 'ヘルプ' || userMessage === 'help' || userMessage === '?') {
    await replyTextWithQuickReply(replyToken, getHelpMessage(options), getRichMenuQuickReplyItems());
    return;
  }

  // 更新コマンド（選択肢のキャッシュをクリア）
  if (userMessage === '更新' || userMessage === 'reload') {
    clearOptionsCache();
    try {
      const newOptions = await getDatabaseOptions();
      await replyTextWithQuickReply(
        replyToken,
        `🔄 選択肢を更新しました\n\n📁 カテゴリ:\n${newOptions.categories.join('、')}\n\n💳 支出方法:\n${newOptions.paymentMethods.join('、')}`,
        getRichMenuQuickReplyItems()
      );
    } catch (error) {
      console.error('Failed to reload options:', error);
      await replyText(replyToken, '選択肢の更新に失敗しました');
    }
    return;
  }

  // 集計コマンド（過去3か月）
  if (userMessage === '集計' || userMessage === '今月') {
    try {
      const monthlyTotals = await getMultiMonthTotals(3);
      const lines = ['📊 支出集計（過去3か月）', ''];

      let grandTotal = 0;
      for (const mt of monthlyTotals) {
        lines.push(`${mt.month}月: ${mt.total.toLocaleString()}円`);
        grandTotal += mt.total;
      }

      lines.push('');
      lines.push(`💰 合計: ${grandTotal.toLocaleString()}円`);

      await replyTextWithQuickReply(replyToken, lines.join('\n'), getRichMenuQuickReplyItems());
    } catch (error) {
      console.error('Failed to get monthly total:', error);
      await replyText(replyToken, '集計の取得に失敗しました');
    }
    return;
  }

  // 内訳コマンド（今月のカテゴリ別集計）
  if (userMessage === '内訳') {
    try {
      const { month, breakdown, total } = await getCategoryBreakdown();
      const lines = [`📊 ${month}月のカテゴリ別内訳`, ''];

      if (breakdown.length === 0) {
        lines.push('データがありません');
      } else {
        for (const item of breakdown) {
          const percent = total > 0 ? Math.round((item.total / total) * 100) : 0;
          lines.push(`${item.category}: ${item.total.toLocaleString()}円 (${percent}%)`);
        }
        lines.push('');
        lines.push(`💰 合計: ${total.toLocaleString()}円`);
      }

      await replyTextWithQuickReply(replyToken, lines.join('\n'), getRichMenuQuickReplyItems());
    } catch (error) {
      console.error('Failed to get category breakdown:', error);
      await replyText(replyToken, '内訳の取得に失敗しました');
    }
    return;
  }

  // 取消・削除コマンド
  if (userMessage === '取消' || userMessage === '削除') {
    await handleDeleteCommand(replyToken, userId);
    return;
  }

  // 修正コマンド
  if (userMessage === '修正') {
    await handleModifyCommand(replyToken, userId);
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
    await replyTextWithQuickReply(replyToken, response, getRichMenuQuickReplyItems());
  } catch (error) {
    console.error('Failed to add expense to Notion:', error);
    await replyText(replyToken, 'Notionへの登録に失敗しました。設定を確認してください。');
  }
}

/**
 * 削除コマンドを処理（確認ダイアログ表示）
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
    // 直近の登録情報を取得して表示
    const expenses: string[] = [];
    for (const pageId of pageIds) {
      const expense = await getExpenseById(pageId);
      if (expense) {
        expenses.push(`・${expense.description}: ${expense.amount.toLocaleString()}円 (${expense.category})`);
      }
    }

    const countText = pageIds.length > 1 ? `${pageIds.length}件` : '';
    const message = [
      `🗑️ ${countText}このレコードを取り消しますか？`,
      '',
      ...expenses,
      '',
      '下のボタンを押してください',
    ].join('\n');

    // 状態を保存
    setUserState(userId, { action: 'confirmDelete' });

    // 確認ボタンを表示
    await replyTextWithQuickReply(replyToken, message, [
      { type: 'action', action: { type: 'message', label: '✅ 取消を確定', text: '取消を確定' } },
      { type: 'action', action: { type: 'message', label: '❌ キャンセル', text: 'キャンセル' } },
    ]);
  } catch (error) {
    console.error('Failed to show delete confirmation:', error);
    await replyText(replyToken, '削除の確認に失敗しました。');
  }
}

/**
 * 削除を実行
 */
async function executeDelete(replyToken: string, userId: string): Promise<void> {
  const pageIds = getUserLastExpense(userId);
  setUserState(userId, null);

  if (!pageIds || pageIds.length === 0) {
    await replyText(replyToken, '削除する支出がありません。');
    return;
  }

  try {
    for (const pageId of pageIds) {
      await deleteExpense(pageId);
    }
    setUserLastExpense(userId, []);

    const countText = pageIds.length > 1 ? `${pageIds.length}件の` : '';
    await replyTextWithQuickReply(
      replyToken,
      `🗑️ ${countText}直近の登録を削除しました`,
      getRichMenuQuickReplyItems()
    );
  } catch (error) {
    console.error('Failed to delete expense:', error);
    await replyText(replyToken, '削除に失敗しました。');
  }
}

/**
 * 修正コマンドを処理（項目選択ボタン表示）
 */
async function handleModifyCommand(
  replyToken: string,
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

  try {
    // 直近の登録情報を取得して表示
    const expenses: string[] = [];
    for (const pageId of pageIds) {
      const expense = await getExpenseById(pageId);
      if (expense) {
        expenses.push(`・${expense.description}: ${expense.amount.toLocaleString()}円`);
        expenses.push(`  📁 ${expense.category} | 💳 ${expense.paymentMethod}`);
      }
    }

    const message = [
      '✏️ 修正する項目を選択してください',
      '',
      ...expenses,
    ].join('\n');

    // 状態を保存
    setUserState(userId, { action: 'waitingModifyField' });

    // 項目選択ボタンを表示
    await replyTextWithQuickReply(replyToken, message, [
      { type: 'action', action: { type: 'message', label: '📁 カテゴリー', text: 'カテゴリー' } },
      { type: 'action', action: { type: 'message', label: '💳 支出方法', text: '支出方法' } },
      { type: 'action', action: { type: 'message', label: '💰 金額', text: '金額' } },
      { type: 'action', action: { type: 'message', label: '📝 支出項目', text: '支出項目' } },
      { type: 'action', action: { type: 'message', label: '❌ キャンセル', text: 'キャンセル' } },
    ]);
  } catch (error) {
    console.error('Failed to show modify options:', error);
    await replyText(replyToken, '修正項目の表示に失敗しました。');
  }
}

/**
 * 修正を実行
 */
async function executeModify(
  replyToken: string,
  userId: string,
  field: string,
  value: string,
  options: DatabaseOptions
): Promise<void> {
  const pageIds = getUserLastExpense(userId);
  setUserState(userId, null);

  if (!pageIds || pageIds.length === 0) {
    await replyText(replyToken, '修正する支出がありません。');
    return;
  }

  try {
    const updates: Partial<ExpenseData> = {};

    switch (field) {
      case 'カテゴリー':
        if (!options.categories.includes(value)) {
          await replyText(
            replyToken,
            `「${value}」は無効なカテゴリーです。\n\n利用可能:\n${options.categories.join('、')}`
          );
          return;
        }
        updates.category = value;
        break;

      case '支出方法':
        if (!options.paymentMethods.includes(value)) {
          await replyText(
            replyToken,
            `「${value}」は無効な支出方法です。\n\n利用可能:\n${options.paymentMethods.join('、')}`
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

      case '支出項目':
        updates.description = value;
        break;

      default:
        await replyText(replyToken, `「${field}」は修正できない項目です。`);
        return;
    }

    // 全ての直近登録を更新
    for (const pageId of pageIds) {
      await updateExpense(pageId, updates);
    }

    const countText = pageIds.length > 1 ? `${pageIds.length}件の` : '';
    await replyTextWithQuickReply(
      replyToken,
      `✏️ ${countText}${field}を「${value}」に修正しました`,
      getRichMenuQuickReplyItems()
    );
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
 * リッチメニューのQuick Replyアイテムを取得
 */
function getRichMenuQuickReplyItems(): QuickReply['items'] {
  return [
    { type: 'action', action: { type: 'message', label: '❓ ヘルプ', text: 'ヘルプ' } },
    { type: 'action', action: { type: 'message', label: '📊 集計', text: '集計' } },
    { type: 'action', action: { type: 'message', label: '🔄 更新', text: '更新' } },
    { type: 'action', action: { type: 'message', label: '🗑️ 取消', text: '取消' } },
    { type: 'action', action: { type: 'message', label: '📋 内訳', text: '内訳' } },
    { type: 'action', action: { type: 'message', label: '✏️ 修正', text: '修正' } },
  ];
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

/**
 * Quick Reply付きテキストメッセージを返信
 */
async function replyTextWithQuickReply(
  replyToken: string,
  text: string,
  items: QuickReply['items']
): Promise<void> {
  const message: TextMessage = {
    type: 'text',
    text,
    quickReply: { items },
  };
  await client.replyMessage({
    replyToken,
    messages: [message],
  });
}
