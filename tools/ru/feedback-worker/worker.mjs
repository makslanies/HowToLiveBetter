// Приёмник формы «Предложить правку». Принимает JSON от сайта и отправляет письмо по SMTP (TLS) через cloudflare:sockets.
// Настройка: `wrangler secret put SMTP_PASS`; сервер, адреса и разрешённые сайты в wrangler.toml.
// Логика в handle() с внедряемой отправкой: тесты в tools/ru/feedback-worker.test.mjs работают без сети.

const MAX_BODY = 8000;
const LIMITS = { text: 2000, source: 500, title: 300, url: 300, contact: 200, short: 10 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const enc = new TextEncoder();

// Убирает управляющие символы, пробелы по краям и режет по длине.
export function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function validate(body) {
  const text = clean(body.text, LIMITS.text);
  if (text.length < 5) return { error: 'Напишите, что нужно исправить.' };
  const contact = clean(body.contact, LIMITS.contact);
  if (contact && !EMAIL_RE.test(contact)) return { error: 'Почта указана неверно.' };
  return {
    value: {
      section: clean(body.section, LIMITS.short),
      item: clean(body.item, LIMITS.short),
      title: clean(body.title, LIMITS.title),
      url: clean(body.url, LIMITS.url),
      text,
      source: clean(body.source, LIMITS.source),
      contact,
    },
  };
}

export function buildMail(v, env) {
  const where = v.section && v.item ? `раздел ${v.section}, пункт ${v.item}` : 'сайт';
  const lines = [
    `Пункт: ${where}. ${v.title}`.trim(),
    `Страница: ${v.url || 'не указана'}`,
    '',
    'Что исправить:',
    v.text,
    '',
    `Источник: ${v.source || 'не указан'}`,
    `Почта для ответа: ${v.contact || 'не указана'}`,
  ];
  const mail = {
    from: env.FROM_EMAIL,
    to: [env.TO_EMAIL],
    subject: `Правка на сайте: ${where}`,
    text: lines.join('\n'),
  };
  if (v.contact) mail.reply_to = v.contact;
  return mail;
}

// Адрес из строки вида «Имя <адрес>» или просто «адрес».
export const bareAddress = (s) => ((String(s).match(/<([^>]+)>/) || [, String(s)])[1]).trim();

function toBase64(text) {
  let bin = '';
  for (const b of enc.encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function wrap76(s) {
  return s.match(/.{1,76}/g)?.join('\r\n') || '';
}

// Заголовок с кириллицей: RFC 2047 (base64, UTF-8).
const encodeHeader = (text) => `=?UTF-8?B?${toBase64(text)}?=`;

export function buildMessage(mail, { messageId, date }) {
  const headers = [
    `From: ${mail.from}`,
    `To: ${mail.to.join(', ')}`,
    mail.reply_to ? `Reply-To: ${mail.reply_to}` : null,
    `Subject: ${encodeHeader(mail.subject.replace(/[\r\n]+/g, ' '))}`,
    `Date: ${date}`,
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  return [...headers, '', wrap76(toBase64(mail.text))].join('\r\n');
}

// Точка в начале строки удваивается (правило SMTP для DATA).
export const dotStuff = (msg) => ('\r\n' + msg).replace(/\r\n\./g, '\r\n..').slice(2);

// Разговор с SMTP-сервером по TLS (порт 465). connect — функция cloudflare:sockets.connect или её замена в тестах.
export async function sendSmtp(env, mail, connect) {
  const socket = connect(
    { hostname: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465) },
    { secureTransport: 'on', allowHalfOpen: false },
  );
  const reader = socket.readable.pipeThrough(new TextDecoderStream()).getReader();
  const writer = socket.writable.getWriter();
  let buf = '';

  // Читает ответ сервера целиком: многострочный ответ заканчивается строкой «NNN текст».
  async function readReply() {
    const lines = [];
    for (;;) {
      const i = buf.indexOf('\r\n');
      if (i < 0) {
        const { value, done } = await reader.read();
        if (done) throw new Error('smtp: соединение закрыто');
        buf += value;
        continue;
      }
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      lines.push(line);
      if (/^\d{3} /.test(line)) return Number(line.slice(0, 3));
    }
  }

  // label нужен, чтобы в ошибке не попадали строки команды (там пароль в base64).
  async function cmd(line, ok, label) {
    await writer.write(enc.encode(line + '\r\n'));
    const code = await readReply();
    if (!ok.includes(code)) throw new Error(`smtp: ${label} ответ ${code}`);
  }

  try {
    if ((await readReply()) !== 220) throw new Error('smtp: нет приветствия');
    await cmd('EHLO hltb-feedback', [250], 'EHLO');
    await cmd('AUTH LOGIN', [334], 'AUTH');
    await cmd(toBase64(env.SMTP_USER), [334], 'логин');
    await cmd(toBase64(env.SMTP_PASS), [235], 'пароль');

    const from = bareAddress(mail.from);
    await cmd(`MAIL FROM:<${from}>`, [250], 'MAIL FROM');
    for (const rcpt of mail.to) await cmd(`RCPT TO:<${bareAddress(rcpt)}>`, [250, 251], 'RCPT TO');
    await cmd('DATA', [354], 'DATA');

    const message = buildMessage(mail, {
      messageId: `${crypto.randomUUID()}@howtolivebetter.ru`,
      date: new Date().toUTCString(),
    });
    await writer.write(enc.encode(dotStuff(message) + '\r\n.\r\n'));
    if ((await readReply()) !== 250) throw new Error('smtp: письмо не принято');

    await cmd('QUIT', [221], 'QUIT').catch(() => {});
  } finally {
    await socket.close?.().catch(() => {});
  }
}

export function corsHeaders(origin, allowed) {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

// По умолчанию письмо уходит через cloudflare:sockets. Модуль подгружается только в Worker, поэтому тесты в Node его не трогают.
async function defaultSend(env, mail) {
  const { connect } = await import('cloudflare:sockets');
  return sendSmtp(env, mail, connect);
}

export async function handle(request, env, send = defaultSend) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin') || '';
  const cors = corsHeaders(origin, allowed);
  const json = (status, data) => new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Метод не разрешён.' });
  if (!allowed.includes(origin)) return json(403, { error: 'Сайт не разрешён.' });
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.TO_EMAIL || !env.FROM_EMAIL) {
    return json(500, { error: 'Сервис не настроен.' });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'Сообщение слишком большое.' });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Неверный формат запроса.' });
  }
  if (!body || typeof body !== 'object') return json(400, { error: 'Неверный формат запроса.' });

  // Поле-ловушка: людям не видно, боты его заполняют. Отвечаем успехом и ничего не отправляем.
  if (clean(body.website, 100)) return json(200, { ok: true });

  const checked = validate(body);
  if (checked.error) return json(400, { error: checked.error });

  try {
    await send(env, buildMail(checked.value, env));
  } catch {
    // Подробности SMTP наружу не отдаём.
    return json(502, { error: 'Не получилось отправить. Попробуйте позже.' });
  }
  return json(200, { ok: true });
}

export default {
  fetch: (request, env) => handle(request, env),
};
