export interface ExpenseData {
  amount: number;
  category: string;
  description: string;
  date: Date;
  paymentMethod: string;
}

export interface ParsedMessage {
  success: boolean;
  data?: ExpenseData;
  error?: string;
}

export const EXPENSE_CATEGORIES = [
  '食費',
  '交通費',
  '日用品',
  '娯楽',
  '医療',
  '衣服',
  '通信費',
  '光熱費',
  '家賃',
  'その他',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const PAYMENT_METHODS = [
  '現金',
  'QR決済',
  'クレジットカード',
  '電子マネー',
  '銀行振込',
  'その他',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
