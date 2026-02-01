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

export interface DatabaseOptions {
  categories: string[];
  paymentMethods: string[];
}

// キーワードからカテゴリを推測するためのマッピング
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  食費: [
    'ランチ',
    '夕食',
    '朝食',
    'コンビニ',
    'スーパー',
    '弁当',
    'カフェ',
    'コーヒー',
    '外食',
    'レストラン',
  ],
  交通費: ['電車', 'バス', 'タクシー', 'ガソリン', '定期', '駐車'],
  日用品: [
    '洗剤',
    'シャンプー',
    'ティッシュ',
    'トイレットペーパー',
    '100均',
    'ドラッグストア',
  ],
  娯楽: ['映画', 'ゲーム', '本', '漫画', 'ライブ', 'カラオケ', '飲み会'],
  医療: ['病院', '薬局', '薬', '診察', '歯医者'],
  衣服: ['服', '靴', 'アクセサリー', 'ユニクロ', 'GU'],
  通信費: ['スマホ', '携帯', 'WiFi', 'インターネット'],
  光熱費: ['電気', 'ガス', '水道'],
  家賃: ['家賃', '賃貸', 'マンション'],
};

// キーワードから支出方法を推測するためのマッピング
export const PAYMENT_KEYWORDS: Record<string, string[]> = {
  QR決済: ['PayPay', 'paypay', 'ペイペイ', 'LINE Pay', 'メルペイ', 'd払い', '楽天ペイ'],
  クレジットカード: ['カード', 'クレカ', 'VISA', 'Master', 'JCB'],
  電子マネー: ['Suica', 'PASMO', 'nanaco', 'WAON', 'iD', 'QuicPay'],
  銀行振込: ['振込', '振り込み', '口座'],
};
