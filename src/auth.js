import crypto from 'node:crypto';

// Telegram Mini App yuborgan initData haqiqiyligini tekshiradi (boshqa odam nomidan buyurtma berib bo'lmasligi uchun)
export function verifyInitData(initData, botToken, maxAgeSec = 86400) {
  if (!initData || typeof initData !== 'string') return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const a = Buffer.from(calc);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const age = Math.floor(Date.now() / 1000) - Number(params.get('auth_date') || 0);
  if (!(age >= -60 && age <= maxAgeSec)) return null;
  try {
    const user = JSON.parse(params.get('user'));
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}
