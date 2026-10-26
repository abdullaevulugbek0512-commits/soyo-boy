import express from 'express';
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, upsertCustomer, setLang } from './db.js';

const { BOT_TOKEN, WEBHOOK_SECRET, DATABASE_URL } = process.env;
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

for (const [k, v] of Object.entries({ BOT_TOKEN, WEBHOOK_SECRET, DATABASE_URL, BASE_URL })) {
  if (!v) {
    console.error(`Sozlama yetishmayapti: ${k}`);
    process.exit(1);
  }
}

const T = {
  uz: {
    chooseLang: 'Tilni tanlang / Выберите язык',
    welcome: 'Soyo do‘koniga xush kelibsiz! Kiyimlarni ko‘rish uchun pastdagi tugmani bosing.',
    open: '🛍 Do‘konni ochish',
  },
  ru: {
    chooseLang: 'Tilni tanlang / Выберите язык',
    welcome: 'Добро пожаловать в магазин Soyo! Нажмите кнопку ниже, чтобы посмотреть одежду.',
    open: '🛍 Открыть магазин',
  },
};

const appUrl = `${BASE_URL}/app/`;
const bot = new Bot(BOT_TOKEN);

function langKeyboard() {
  return new InlineKeyboard().text('🇺🇿 O‘zbekcha', 'lang:uz').text('🇷🇺 Русский', 'lang:ru');
}

function shopKeyboard(lang) {
  return new InlineKeyboard().webApp(T[lang].open, appUrl);
}

bot.command('start', async (ctx) => {
  const customer = await upsertCustomer(ctx.from);
  if (!customer.lang) {
    return ctx.reply(T.uz.chooseLang, { reply_markup: langKeyboard() });
  }
  return ctx.reply(T[customer.lang].welcome, { reply_markup: shopKeyboard(customer.lang) });
});

bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
  const lang = ctx.match[1];
  await upsertCustomer(ctx.from);
  await setLang(ctx.from.id, lang);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(T[lang].welcome, { reply_markup: shopKeyboard(lang) });
});

bot.catch((err) => console.error('Bot xatosi:', err.error?.message ?? err));

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));

app.get('/health', (_req, res) => res.send('ok'));
app.use('/app', express.static(path.join(here, '..', 'public', 'app')));
app.post('/webhook', webhookCallback(bot, 'express', { secretToken: WEBHOOK_SECRET }));

await migrate();
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
