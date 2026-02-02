import { messagingApi } from '@line/bot-sdk';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!channelAccessToken) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN is required');
  process.exit(1);
}

const client = new messagingApi.MessagingApiClient({ channelAccessToken });
const blobClient = new messagingApi.MessagingApiBlobClient({ channelAccessToken });

/**
 * リッチメニューを作成してデフォルトに設定
 */
async function createRichMenu() {
  console.log('Creating rich menu...');

  // リッチメニューの定義
  const richMenu = {
    size: {
      width: 2500,
      height: 843,
    },
    selected: true,
    name: '家計簿メニュー',
    chatBarText: 'メニュー',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: { type: 'message' as const, text: 'ヘルプ' },
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: { type: 'message' as const, text: '集計' },
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: { type: 'message' as const, text: '更新' },
      },
    ],
  };

  try {
    // 1. リッチメニューを作成
    const response = await client.createRichMenu(richMenu);
    const richMenuId = response.richMenuId;
    console.log(`Rich menu created: ${richMenuId}`);

    // 2. 画像をアップロード
    const imagePath = path.join(__dirname, '../assets/richmenu.png');
    if (fs.existsSync(imagePath)) {
      const imageBuffer = fs.readFileSync(imagePath);
      const blob = new Blob([imageBuffer], { type: 'image/png' });
      await blobClient.setRichMenuImage(richMenuId, blob);
      console.log('Rich menu image uploaded');
    } else {
      console.log(`Warning: Image not found at ${imagePath}`);
      console.log('Please create the image and run this script again.');
      console.log('Or upload the image manually via LINE Official Account Manager.');
    }

    // 3. デフォルトリッチメニューに設定
    await client.setDefaultRichMenu(richMenuId);
    console.log('Rich menu set as default');

    console.log('\n✅ Rich menu setup complete!');
    console.log(`Rich Menu ID: ${richMenuId}`);
  } catch (error) {
    console.error('Failed to create rich menu:', error);
    process.exit(1);
  }
}

/**
 * 既存のリッチメニューを削除
 */
async function deleteAllRichMenus() {
  console.log('Deleting existing rich menus...');

  try {
    const response = await client.getRichMenuList();
    for (const menu of response.richmenus) {
      await client.deleteRichMenu(menu.richMenuId);
      console.log(`Deleted: ${menu.richMenuId}`);
    }
    console.log('All rich menus deleted');
  } catch (error) {
    console.error('Failed to delete rich menus:', error);
  }
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--delete')) {
    await deleteAllRichMenus();
  } else {
    await createRichMenu();
  }
}

main();
