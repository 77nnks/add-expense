import express, { Request, Response } from 'express';
import { middleware, MiddlewareConfig, WebhookEvent } from '@line/bot-sdk';
import { config } from './config';
import { handleEvent } from './handlers/line';

const app = express();

const middlewareConfig: MiddlewareConfig = {
  channelSecret: config.line.channelSecret,
};

// ヘルスチェック
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// LINE Webhook
app.post(
  '/webhook',
  middleware(middlewareConfig),
  async (req: Request, res: Response): Promise<void> => {
    const events: WebhookEvent[] = req.body.events;

    try {
      await Promise.all(events.map(handleEvent));
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});
