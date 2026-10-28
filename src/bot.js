import { Bot, InlineKeyboard } from 'grammy';
import { upsertCustomer, setLang } from './db.js';
import { attachReceipt, confirmPayment, rejectPayment, getOrder, money, ownerIds, customerLang } from './orders.js';
import { invalidateCatalog } from './api.js';

const h = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const T = {
  uz: {
    chooseLang: 'Tilni tanlang / Выберите язык',
    welcome: 'Soyo do‘koniga xush kelibsiz! Kiyimlarni ko‘rish uchun pastdagi tugmani bosing.',
    open: '🛍 Do‘konni ochish',
    created: (o) => `✅ Buyurtma #${o.id} qabul qilindi.`,
    items: 'Kiyimlar', delivery: 'Yetkazib berish', total: 'Jami',
    pay: 'To‘lov uchun karta:', holder: 'Karta egasi',
    noCard: 'Karta raqami hozircha sozlanmagan, iltimos do‘kon bilan bog‘laning.',
    sendReceipt: 'To‘lovni amalga oshirgach, chek rasmini (skrinshot) shu yerga yuboring.',
    checking: '⏳ Tekshirilmoqda. Do‘kon egasi to‘lovni tasdiqlashi bilan sizga xabar beramiz.',
    already: 'Chek allaqachon yuborilgan, tekshirilmoqda.',
    none: 'Hozircha to‘lov kutayotgan buyurtma yo‘q. Avval do‘konda buyurtma bering.',
    confirmed: (id) => `✅ To‘lov tasdiqlandi! Buyurtma #${id} qabul qilindi va tayyorlanmoqda.`,
    rejected: (id) => `❌ Buyurtma #${id} uchun to‘lov tasdiqlanmadi. Iltimos, to‘g‘ri chekni qayta yuboring yoki do‘kon bilan bog‘laning.`,
    technical: 'Texnik nosozlik, iltimos birozdan keyin urinib ko‘ring.',
  },
  ru: {
    chooseLang: 'Tilni tanlang / Выберите язык',
    welcome: 'Добро пожаловать в магазин Soyo! Нажмите кнопку ниже, чтобы посмотреть одежду.',
    open: '🛍 Открыть магазин',
    created: (o) => `✅ Заказ #${o.id} принят.`,
    items: 'Одежда', delivery: 'Доставка', total: 'Итого',
    pay: 'Карта для оплаты:', holder: 'Владелец карты',
    noCard: 'Номер карты пока не настроен, пожалуйста, свяжитесь с магазином.',
    sendReceipt: 'После оплаты отправьте сюда фото чека (скриншот).',
    checking: '⏳ Проверяем. Как только владелец магазина подтвердит оплату, мы сообщим вам.',
    already: 'Чек уже отправлен, идёт проверка.',
    none: 'Нет заказов, ожидающих оплаты. Сначала оформите заказ в магазине.',
    confirmed: (id) => `✅ Оплата подтверждена! Заказ #${id} принят и готовится.`,
    rejected: (id) => `❌ Оплата по заказу #${id} не подтверждена. Пожалуйста, отправьте правильный чек ещё раз или свяжитесь с магазином.`,
    technical: 'Техническая неполадка, попробуйте позже.',
  },
};

function itemLines(o, lang) {
  return o.items.map((i) => `• ${h(i.name)} (${h(i.color)}, ${h(i.size)}) × ${i.qty} — ${money(i.unit_price * i.qty, lang)}`).join('\n');
}

// Buyurtma yaratilgach mijozga to'lov ma'lumotini yuboradi
export async function notifyOrderCreated(bot, orderId) {
  const lang = await customerLang((await getOrder(orderId)).customer_id);
  const o = await getOrder(orderId, lang);
  const t = T[lang];
  const card = (process.env.CARD_NUMBER || '').trim();
  const lines = [
    t.created(o), '', itemLines(o, lang), '',
    `${t.items}: ${money(o.items_total, lang)}`,
    `${t.delivery}: ${money(o.delivery_fee, lang)}`,
    `<b>${t.total}: ${money(o.items_total + o.delivery_fee, lang)}</b>`, '',
  ];
  if (card) {
    lines.push(t.pay, `<code>${h(card)}</code>`);
    if (process.env.CARD_HOLDER) lines.push(`${t.holder}: ${h(process.env.CARD_HOLDER)}`);
    lines.push('', t.sendReceipt);
  } else {
    lines.push(t.noCard);
  }
  await bot.api.sendMessage(o.customer_id, lines.join('\n'), { parse_mode: 'HTML' });
}

export function createBot(token, { appUrl, botInfo } = {}) {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);
  const langKb = () => new InlineKeyboard().text('🇺🇿 O‘zbekcha', 'lang:uz').text('🇷🇺 Русский', 'lang:ru');
  const shopKb = (lang) => new InlineKeyboard().webApp(T[lang].open, appUrl);

  bot.use(async (ctx, next) => {
    console.log(`Yangilanish: ${Object.keys(ctx.update).filter((k) => k !== 'update_id').join(',')} (foydalanuvchi ${ctx.from?.id ?? '?'})`);
    await next();
  });

  bot.command('id', (ctx) => ctx.reply(`Telegram ID: ${ctx.from.id}`));

  bot.command('start', async (ctx) => {
    let customer = { lang: null };
    try { customer = await upsertCustomer(ctx.from); } catch (err) { console.error('Bazaga yozishda xato:', err.message); }
    if (!customer.lang) return ctx.reply(T.uz.chooseLang, { reply_markup: langKb() });
    return ctx.reply(T[customer.lang].welcome, { reply_markup: shopKb(customer.lang) });
  });

  bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
    const lang = ctx.match[1];
    await ctx.answerCallbackQuery();
    try { await upsertCustomer(ctx.from); await setLang(ctx.from.id, lang); } catch (err) { console.error('Tilni saqlashda xato:', err.message); }
    await ctx.editMessageText(T[lang].welcome, { reply_markup: shopKb(lang) });
  });

  // Mijoz chek rasmini yuboradi
  const onReceipt = async (ctx, receipt, kind) => {
    const lang = await customerLang(ctx.from.id);
    const t = T[lang];
    const owners = ownerIds();
    if (!owners.length) { console.error('OWNER_IDS sozlanmagan'); return ctx.reply(t.technical); }
    const r = await attachReceipt(ctx.from.id, `${kind}:${receipt}`);
    if (r.state === 'none') return ctx.reply(t.none);
    if (r.state === 'already') return ctx.reply(t.already);
    const o = await getOrder(r.id, 'uz');
    const caption = [
      `💳 To‘lov cheki, buyurtma #${o.id}`,
      `Mijoz: ${o.customer_name}${o.username ? ` (@${o.username})` : ''}`,
      `Telefon: ${o.phone}`, `Manzil: ${o.address}`, '',
      ...o.items.map((i) => `• ${i.name} (${i.color}, ${i.size}) × ${i.qty}`), '',
      `Kiyimlar: ${money(o.items_total)}`, `Yetkazib berish: ${money(o.delivery_fee)}`,
      `Jami: ${money(o.items_total + o.delivery_fee)}`,
    ].join('\n');
    const kb = new InlineKeyboard().text('✅ Tasdiqlash', `pay:ok:${o.id}`).text('❌ Rad etish', `pay:no:${o.id}`);
    let sent = 0;
    for (const id of owners) {
      try {
        if (kind === 'photo') await bot.api.sendPhoto(id, receipt, { caption, reply_markup: kb });
        else await bot.api.sendDocument(id, receipt, { caption, reply_markup: kb });
        sent += 1;
      } catch (err) { console.error(`Egasiga (${id}) yuborib bo‘lmadi:`, err.message); }
    }
    if (!sent) {
      await attachReceiptRollback(o.id);
      return ctx.reply(t.technical);
    }
    return ctx.reply(t.checking);
  };
  bot.on('message:photo', (ctx) => onReceipt(ctx, ctx.message.photo.at(-1).file_id, 'photo'));
  bot.on('message:document', (ctx) => {
    if (!(ctx.message.document.mime_type || '').startsWith('image/')) return;
    return onReceipt(ctx, ctx.message.document.file_id, 'doc');
  });

  // Egasi tasdiqlaydi yoki rad etadi
  bot.callbackQuery(/^pay:(ok|no):(\d+)$/, async (ctx) => {
    if (!ownerIds().includes(ctx.from.id)) return ctx.answerCallbackQuery({ text: 'Ruxsat yo‘q', show_alert: true });
    const ok = ctx.match[1] === 'ok';
    const id = Number(ctx.match[2]);
    const done = async (mark) => {
      await ctx.answerCallbackQuery();
      const base = ctx.callbackQuery.message?.caption || '';
      await ctx.editMessageCaption({ caption: `${base}\n\n${mark}`, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    };
    if (ok) {
      const r = await confirmPayment(id);
      if (r.state === 'nostock') return ctx.answerCallbackQuery({ text: `Qoldiq yetarli emas: ${r.item}. Buyurtma tasdiqlanmadi.`, show_alert: true });
      if (r.state !== 'ok') return ctx.answerCallbackQuery({ text: 'Bu buyurtma allaqachon ko‘rib chiqilgan.', show_alert: true });
      invalidateCatalog();
      const o = await getOrder(id);
      await bot.api.sendMessage(o.customer_id, T[await customerLang(o.customer_id)].confirmed(id)).catch((e) => console.error('Mijozga yozib bo‘lmadi:', e.message));
      return done('✅ Tasdiqlandi');
    }
    const r = await rejectPayment(id);
    if (r.state !== 'ok') return ctx.answerCallbackQuery({ text: 'Bu buyurtma allaqachon ko‘rib chiqilgan.', show_alert: true });
    const o = await getOrder(id);
    await bot.api.sendMessage(o.customer_id, T[await customerLang(o.customer_id)].rejected(id)).catch((e) => console.error('Mijozga yozib bo‘lmadi:', e.message));
    return done('❌ Rad etildi');
  });

  bot.catch((err) => console.error('Bot xatosi:', err.error?.message ?? err));
  return bot;
}

async function attachReceiptRollback(orderId) {
  const { pool } = await import('./db.js');
  await pool.query("UPDATE orders SET status = 'awaiting_payment', receipt_file_id = NULL WHERE id = $1 AND status = 'payment_check'", [orderId]);
}
