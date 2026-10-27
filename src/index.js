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

bot.use(async (ctx, next) => {
  console.log(`Yangilanish: ${Object.keys(ctx.update).filter((k) => k !== 'update_id').join(',')} (foydalanuvchi ${ctx.from?.id ?? '?'})`);
  await next();
});

bot.command('start', async (ctx) => {
  let customer = { lang: null };
  try {
    customer = await upsertCustomer(ctx.from);
  } catch (err) {
    console.error('Bazaga yozishda xato:', err.message);
  }
  if (!customer.lang) {
    return ctx.reply(T.uz.chooseLang, { reply_markup: langKeyboard() });
  }
  return ctx.reply(T[customer.lang].welcome, { reply_markup: shopKeyboard(customer.lang) });
});

bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
  const lang = ctx.match[1];
  await ctx.answerCallbackQuery();
  try {
    await upsertCustomer(ctx.from);
    await setLang(ctx.from.id, lang);
  } catch (err) {
    console.error('Tilni saqlashda xato:', err.message);
  }
  await ctx.editMessageText(T[lang].welcome, { reply_markup: shopKeyboard(lang) });
});

bot.catch((err) => console.error('Bot xatosi:', err.error?.message ?? err));

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));

process.on('unhandledRejection', (err) => console.error('Kutilmagan xato:', err?.message ?? err));
process.on('uncaughtException', (err) => console.error('Kutilmagan xato:', err?.message ?? err));

app.use(express.json());
app.get('/health', (_req, res) => res.send('ok'));
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
