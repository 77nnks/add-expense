import { Client } from '@notionhq/client';
import { config } from '../config';
import { ExpenseData, DatabaseOptions } from '../types';

const notion = new Client({
  auth: config.notion.apiKey,
});

// 選択肢のキャッシュ
let cachedOptions: DatabaseOptions | null = null;

// ユーザーごとの直近の登録ページIDを保持（メモリ内）
const userLastExpense: Map<string, string[]> = new Map();

/**
 * NotionデータベースからSelect項目の選択肢を取得
 */
export async function getDatabaseOptions(): Promise<DatabaseOptions> {
  if (cachedOptions) {
    console.log('[DEBUG] Returning cached options:', JSON.stringify(cachedOptions));
    return cachedOptions;
  }
  console.log('[DEBUG] No cache, fetching from Notion...');

  const response = await notion.databases.retrieve({
    database_id: config.notion.databaseId,
  });

  const categories: string[] = [];
  const paymentMethods: string[] = [];

  if ('properties' in response) {
    // デバッグ: 全プロパティ名を出力
    console.log('Database properties:', Object.keys(response.properties));

    // カテゴリーの選択肢を取得
    const categoryProp = response.properties['カテゴリー'];
    console.log('カテゴリー property:', JSON.stringify(categoryProp, null, 2));
    if (categoryProp && categoryProp.type === 'select' && categoryProp.select.options) {
      for (const option of categoryProp.select.options) {
        categories.push(option.name);
      }
    }

    // 支出方法の選択肢を取得
    const paymentProp = response.properties['支出方法'];
    console.log('支出方法 property:', JSON.stringify(paymentProp, null, 2));
    if (paymentProp && paymentProp.type === 'select' && paymentProp.select.options) {
      for (const option of paymentProp.select.options) {
        paymentMethods.push(option.name);
      }
    }
  }

  cachedOptions = {
    categories: categories.length > 0 ? categories : ['その他'],
    paymentMethods: paymentMethods.length > 0 ? paymentMethods : ['現金'],
  };

  console.log('Loaded options from Notion:', cachedOptions);
  return cachedOptions;
}

/**
 * キャッシュをクリア（選択肢が更新された場合に使用）
 */
export function clearOptionsCache(): void {
  cachedOptions = null;
}

/**
 * Notionデータベースに支出データを登録
 */
export async function addExpenseToNotion(expense: ExpenseData): Promise<string> {
  const response = await notion.pages.create({
    parent: {
      database_id: config.notion.databaseId,
    },
    properties: {
      // 支出項目 (タイトル)
      支出項目: {
        title: [
          {
            text: {
              content: expense.description,
            },
          },
        ],
      },
      // 金額
      金額: {
        number: expense.amount,
      },
      // カテゴリー
      カテゴリー: {
        select: {
          name: expense.category,
        },
      },
      // 日付
      日付: {
        date: {
          start: expense.date.toISOString().split('T')[0],
        },
      },
      // 支出方法
      支出方法: {
        select: {
          name: expense.paymentMethod,
        },
      },
    },
  });

  return response.id;
}

/**
 * 日本時間の現在日時を取得
 */
function getJSTDate(): Date {
  const now = new Date();
  // UTC+9時間で日本時間に変換
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

/**
 * 今月の支出合計を取得
 */
export async function getMonthlyTotal(): Promise<number> {
  const totals = await getMultiMonthTotals(1);
  return totals[0]?.total || 0;
}

/**
 * 月別集計結果の型
 */
export interface MonthlyTotal {
  year: number;
  month: number;
  total: number;
}

/**
 * 過去N月分の月別支出合計を取得（月単位で分割してクエリ）
 */
export async function getMultiMonthTotals(months: number = 3): Promise<MonthlyTotal[]> {
  const jstNow = getJSTDate();
  const results: MonthlyTotal[] = [];

  const currentYear = jstNow.getUTCFullYear();
  const currentMonth = jstNow.getUTCMonth();

  console.log('[DEBUG] getMultiMonthTotals - JST Now:', jstNow.toISOString());
  console.log('[DEBUG] Current: year=', currentYear, 'month=', currentMonth + 1);

  // 各月を個別にクエリ
  for (let i = 0; i < months; i++) {
    let targetYear = currentYear;
    let targetMonth = currentMonth - i;
    while (targetMonth < 0) {
      targetMonth += 12;
      targetYear--;
    }

    const total = await getMonthTotal(targetYear, targetMonth);
    results.push({
      year: targetYear,
      month: targetMonth + 1,
      total,
    });
  }

  console.log('[DEBUG] Final results:', results);
  return results;
}

/**
 * 指定した月の支出合計を取得
 */
async function getMonthTotal(year: number, month: number): Promise<number> {
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  console.log(`[DEBUG] getMonthTotal - ${month + 1}月: ${startDate} to ${endDate}`);

  const filter = {
    and: [
      {
        property: '日付',
        date: {
          on_or_after: startDate,
        },
      },
      {
        property: '日付',
        date: {
          on_or_before: endDate,
        },
      },
    ],
  };

  let total = 0;
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  // ページネーション対応
  while (hasMore) {
    const response = await notion.databases.query({
      database_id: config.notion.databaseId,
      filter,
      start_cursor: startCursor,
    });

    console.log(`[DEBUG] ${month + 1}月 - Records fetched: ${response.results.length}, has_more: ${response.has_more}`);

    for (const page of response.results) {
      if ('properties' in page) {
        const amountProp = page.properties['金額'];
        if (
          amountProp &&
          amountProp.type === 'number' &&
          typeof amountProp.number === 'number'
        ) {
          total += amountProp.number;
        }
      }
    }

    hasMore = response.has_more;
    startCursor = response.next_cursor ?? undefined;
  }

  console.log(`[DEBUG] ${month + 1}月 - Total: ${total}`);
  return total;
}

/**
 * カテゴリ別集計結果の型
 */
export interface CategoryBreakdown {
  category: string;
  total: number;
}

/**
 * 今月のカテゴリ別支出内訳を取得
 */
export async function getCategoryBreakdown(): Promise<{
  month: number;
  breakdown: CategoryBreakdown[];
  total: number;
}> {
  const jstNow = getJSTDate();
  const year = jstNow.getUTCFullYear();
  const month = jstNow.getUTCMonth();

  // 今月の開始日と終了日
  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  console.log('[DEBUG] getCategoryBreakdown - JST Now:', jstNow.toISOString());
  console.log('[DEBUG] getCategoryBreakdown - Query range:', startOfMonth, 'to', endOfMonth);

  // 日付フィルターはANDで結合
  const filter = {
    and: [
      {
        property: '日付',
        date: {
          on_or_after: startOfMonth,
        },
      },
      {
        property: '日付',
        date: {
          on_or_before: endOfMonth,
        },
      },
    ],
  };

  // カテゴリごとに集計（ページネーション対応）
  const categoryTotals: Map<string, number> = new Map();
  let total = 0;
  let hasMore = true;
  let startCursor: string | undefined = undefined;
  let recordCount = 0;

  while (hasMore) {
    const response = await notion.databases.query({
      database_id: config.notion.databaseId,
      filter,
      start_cursor: startCursor,
    });

    recordCount += response.results.length;
    console.log(`[DEBUG] getCategoryBreakdown - Fetched: ${response.results.length}, has_more: ${response.has_more}`);

    for (const page of response.results) {
      if ('properties' in page) {
        const categoryProp = page.properties['カテゴリー'];
        const amountProp = page.properties['金額'];

        if (
          amountProp &&
          amountProp.type === 'number' &&
          typeof amountProp.number === 'number'
        ) {
          const amount = amountProp.number;
          total += amount;

          let category = 'その他';
          if (
            categoryProp &&
            categoryProp.type === 'select' &&
            categoryProp.select &&
            'name' in categoryProp.select &&
            categoryProp.select.name
          ) {
            category = categoryProp.select.name;
          }

          const current = categoryTotals.get(category) || 0;
          categoryTotals.set(category, current + amount);
        }
      }
    }

    hasMore = response.has_more;
    startCursor = response.next_cursor ?? undefined;
  }

  console.log('[DEBUG] getCategoryBreakdown - Total records:', recordCount);
  console.log('[DEBUG] Category totals map:', Object.fromEntries(categoryTotals));
  console.log('[DEBUG] Grand total:', total);

  // 金額の多い順にソート
  const breakdown: CategoryBreakdown[] = Array.from(categoryTotals.entries())
    .map(([category, categoryTotal]) => ({ category, total: categoryTotal }))
    .sort((a, b) => b.total - a.total);

  return {
    month: month + 1,
    breakdown,
    total,
  };
}

/**
 * ユーザーの直近の登録ページIDを保存
 */
export function setUserLastExpense(userId: string, pageIds: string[]): void {
  userLastExpense.set(userId, pageIds);
}

/**
 * ユーザーの直近の登録ページIDを取得
 */
export function getUserLastExpense(userId: string): string[] | undefined {
  return userLastExpense.get(userId);
}

/**
 * 支出データを更新
 */
export async function updateExpense(
  pageId: string,
  updates: Partial<ExpenseData>
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {};

  if (updates.description !== undefined) {
    properties['支出項目'] = {
      title: [{ text: { content: updates.description } }],
    };
  }

  if (updates.amount !== undefined) {
    properties['金額'] = { number: updates.amount };
  }

  if (updates.category !== undefined) {
    properties['カテゴリー'] = { select: { name: updates.category } };
  }

  if (updates.paymentMethod !== undefined) {
    properties['支出方法'] = { select: { name: updates.paymentMethod } };
  }

  if (updates.date !== undefined) {
    properties['日付'] = {
      date: { start: updates.date.toISOString().split('T')[0] },
    };
  }

  await notion.pages.update({
    page_id: pageId,
    properties,
  });
}

/**
 * 支出データを削除（アーカイブ）
 */
export async function deleteExpense(pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    archived: true,
  });
}

/**
 * ページIDから支出データを取得
 */
export async function getExpenseById(pageId: string): Promise<ExpenseData | null> {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });

    if (!('properties' in page)) {
      return null;
    }

    const props = page.properties;

    // 支出項目（タイトル）
    let description = '';
    const titleProp = props['支出項目'];
    if (titleProp && titleProp.type === 'title' && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
      description = titleProp.title[0].plain_text;
    }

    // 金額
    let amount = 0;
    const amountProp = props['金額'];
    if (amountProp && amountProp.type === 'number' && typeof amountProp.number === 'number') {
      amount = amountProp.number;
    }

    // カテゴリー
    let category = '';
    const categoryProp = props['カテゴリー'];
    if (categoryProp && categoryProp.type === 'select' && categoryProp.select && 'name' in categoryProp.select) {
      category = categoryProp.select.name || '';
    }

    // 支出方法
    let paymentMethod = '';
    const paymentProp = props['支出方法'];
    if (paymentProp && paymentProp.type === 'select' && paymentProp.select && 'name' in paymentProp.select) {
      paymentMethod = paymentProp.select.name || '';
    }

    // 日付
    let date = new Date();
    const dateProp = props['日付'];
    if (dateProp && dateProp.type === 'date' && dateProp.date?.start) {
      date = new Date(dateProp.date.start);
    }

    return { description, amount, category, paymentMethod, date };
  } catch (error) {
    console.error('Failed to get expense by ID:', error);
    return null;
  }
}

/**
 * ユーザーの操作状態
 */
export interface UserState {
  action: 'confirmDelete' | 'waitingModifyField' | 'waitingModifyValue';
  field?: string; // 修正対象のフィールド
}

// ユーザーの操作状態を保持
const userStates: Map<string, UserState> = new Map();

/**
 * ユーザーの操作状態を設定
 */
export function setUserState(userId: string, state: UserState | null): void {
  if (state === null) {
    userStates.delete(userId);
  } else {
    userStates.set(userId, state);
  }
}

/**
 * ユーザーの操作状態を取得
 */
export function getUserState(userId: string): UserState | undefined {
  return userStates.get(userId);
}
