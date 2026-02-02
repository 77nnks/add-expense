import { Client } from '@notionhq/client';
import { config } from '../config';
import { ExpenseData, DatabaseOptions } from '../types';

const notion = new Client({
  auth: config.notion.apiKey,
});

// 選択肢のキャッシュ
let cachedOptions: DatabaseOptions | null = null;

/**
 * NotionデータベースからSelect項目の選択肢を取得
 */
export async function getDatabaseOptions(): Promise<DatabaseOptions> {
  if (cachedOptions) {
    return cachedOptions;
  }

  const response = await notion.databases.retrieve({
    database_id: config.notion.databaseId,
  });

  const categories: string[] = [];
  const paymentMethods: string[] = [];

  if ('properties' in response) {
    // カテゴリーの選択肢を取得
    const categoryProp = response.properties['カテゴリー'];
    if (categoryProp && categoryProp.type === 'select' && categoryProp.select.options) {
      for (const option of categoryProp.select.options) {
        categories.push(option.name);
      }
    }

    // 支出方法の選択肢を取得
    const paymentProp = response.properties['支出方法'];
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
  const jstNow = getJSTDate();
  const year = jstNow.getUTCFullYear();
  const month = jstNow.getUTCMonth();

  // 今月の開始日と終了日（YYYY-MM-DD形式）
  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  console.log(`Filtering: ${startOfMonth} to ${endOfMonth}`);

  const response = await notion.databases.query({
    database_id: config.notion.databaseId,
    filter: {
      property: '日付',
      date: {
        on_or_after: startOfMonth,
        on_or_before: endOfMonth,
      },
    },
  });

  let total = 0;
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

  return total;
}
