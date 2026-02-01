import { Client } from '@notionhq/client';
import { config } from '../config';
import { ExpenseData } from '../types';

const notion = new Client({
  auth: config.notion.apiKey,
});

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
 * 今月の支出合計を取得
 */
export async function getMonthlyTotal(): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const response = await notion.databases.query({
    database_id: config.notion.databaseId,
    filter: {
      property: '日付',
      date: {
        on_or_after: startOfMonth.toISOString().split('T')[0],
        on_or_before: endOfMonth.toISOString().split('T')[0],
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
