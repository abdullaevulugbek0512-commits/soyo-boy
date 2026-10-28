import express from 'express';
import { webhookCallback } from 'grammy';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './db.js';
import { makeApi } from './api.js';
import { createBot, notifyOrderCreated } from './bot.js';
import { seedIfEmpty } from './seed.js';

const { BOT_TOKEN, WEBHOOK_SECRET, DATABASE_URL } = process.env;
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

for (const [k, v] of Object.entries({ BOT_TOKEN, WEBHOOK_SECRET, DATABASE_URL, BASE_URL })) {
  if (!v) {
    console.error(`Sozlama yetishmayapti: ${k}`);
    process.exit(1);
  }
}
if (!process.env.OWNER_IDS) console.warn('Diqqat: OWNER_IDS sozlanmagan, chek egasiga yetib bormaydi.');
if (!process.env.CARD_NUMBER) console.warn('Diqqat: CARD_NUMBER sozlanmagan.');

const appUrl = `${BASE_URL}/app/`;
const bot = createBot(BOT_TOKEN, { appUrl });

process.on('unhandledRejection', (err) => console.error('Kutilmagan xato:', err?.message ?? err));
process.on('uncaughtException', (err) => console.error('Kutilmagan xato:', err?.message ?? err));

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: '100kb' }));
app.get('/health', (_req, res) => res.send('ok'));
app.use('/api', makeApi({ botToken: BOT_TOKEN, onOrderCreated: (id) => notifyOrderCreated(bot, id) }));
app.use('/img', express.static(path.join(here, '..', 'public', 'img'), { maxAge: '7d' }));
app.use('/app', express.static(path.join(here, '..', 'public', 'app')));

const handleWebhook = webhookCallback(bot, 'express', {
  secretToken: WEBHOOK_SECRET,
  timeoutMilliseconds: 25000,
  onTimeout: 'return',
});
app.post('/webhook', async (req, res) => {
  try {
    await handleWebhook(req, res);
  } catch (err) {
    console.error('Webhook xatosi:', err.message);
    if (!res.headersSent) res.sendStatus(200);
  }
});

await migrate();
await seedIfEmpty();
await bot.init();
await bot.api.setWebhook(`${BASE_URL}/webhook`, {
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
});
await bot.api.setChatMenuButton({
  menu_button: { type: 'web_app', text: 'Do‘kon', web_app: { url: appUrl } },
});

app.listen(PORT, () => console.log(`Bot ishga tushdi: @${bot.botInfo.username}, port ${PORT}`));
