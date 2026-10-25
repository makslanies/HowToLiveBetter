import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Readable, Writable } from 'node:stream';
import { handle, buildMail, buildMessage, dotStuff, sendSmtp } from './feedback-worker/worker.mjs';

const ENV = {
  SMTP_HOST: 'smtp.example',
  SMTP_PORT: '465',
  SMTP_USER: 'support@example.com',
  SMTP_PASS: 'secret-pass',
  TO_EMAIL: 'owner@example.com',
  FROM_EMAIL: 'HLTB <support@example.com>',
  ALLOWED_ORIGINS: 'https://howtolivebetter.ru,http://127.0.0.1:8080',
};
const ORIGIN = 'https://howtolivebetter.ru';

const post = (body, origin = ORIGIN) => new Request('https://feedback.example/', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

// Фейковая отправка: запоминает письма и возвращает успех.
const okSend = () => {
  const mails = [];
  const fn = async (env, mail) => { mails.push(mail); };
  return { fn, mails };
};

const validBody = { section: '3', item: '12', title: 'Пример', url: 'https://howtolivebetter.ru/p/3-12/', text: 'Устарел закон', source: '', contact: '' };

test('OPTIONS отвечает 204 и CORS-заголовками для разрешённого сайта', async () => {
  const res = await handle(new Request('https://f/', { method: 'OPTIONS', headers: { origin: ORIGIN } }), ENV);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
});

test('чужой сайт получает 403 и без CORS-заголовка', async () => {
  const { fn, mails } = okSend();
  const res = await handle(post(validBody, 'https://evil.example'), ENV, fn);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(mails.length, 0);
});

test('GET отклоняется с 405', async () => {
  const res = await handle(new Request('https://f/', { method: 'GET', headers: { origin: ORIGIN } }), ENV);
  assert.equal(res.status, 405);
});

test('битый JSON даёт 400', async () => {
  const { fn, mails } = okSend();
  const res = await handle(post('{не json'), ENV, fn);
  assert.equal(res.status, 400);
  assert.equal(mails.length, 0);
});

test('слишком большой запрос даёт 413', async () => {
  const { fn, mails } = okSend();
  const res = await handle(post({ ...validBody, text: 'а'.repeat(9000) }), ENV, fn);
  assert.equal(res.status, 413);
  assert.equal(mails.length, 0);
});

test('пустой текст правки даёт 400 и не отправляет письмо', async () => {
  const { fn, mails } = okSend();
  const res = await handle(post({ ...validBody, text: '  ' }), ENV, fn);
  assert.equal(res.status, 400);
  assert.equal(mails.length, 0);
});

test('неверная почта даёт 400', async () => {
  const { fn, mails } = okSend();
  const res = await handle(post({ ...validBody, contact: 'не почта' }), ENV, fn);
  assert.equal(res.status, 400);
  assert.equal(mails.length, 0);
});

test('заполненная ловушка-поле отвечает успехом, но письмо не уходит', async () => {
  const { fn, mails } = okSend();
  const res = await handle(post({ ...validBody, website: 'http://spam.example' }), ENV, fn);
  assert.equal(res.status, 200);
  assert.equal(mails.length, 0);
});

test('корректная правка уходит письмом с reply_to и ссылкой на источник', async () => {
  const { fn, mails } = okSend();
  const res = await handle(post({ ...validBody, source: 'https://www.gov.ru/x', contact: 'reader@example.com' }), ENV, fn);
  assert.equal(res.status, 200);
  assert.equal(mails.length, 1);
  const mail = mails[0];
  assert.deepEqual(mail.to, ['owner@example.com']);
  assert.equal(mail.from, ENV.FROM_EMAIL);
  assert.equal(mail.reply_to, 'reader@example.com');
  assert.match(mail.subject, /раздел 3, пункт 12/);
  assert.match(mail.text, /Устарел закон/);
  assert.match(mail.text, /https:\/\/www\.gov\.ru\/x/);
});

test('без почты для ответа reply_to не ставится', async () => {
  const { fn, mails } = okSend();
  await handle(post(validBody), ENV, fn);
  assert.equal('reply_to' in mails[0], false);
});

test('ошибка отправки даёт 502 без подробностей SMTP', async () => {
  const fn = async () => { throw new Error('smtp: AUTH пароль ответ 535 secret-pass'); };
  const res = await handle(post(validBody), ENV, fn);
  assert.equal(res.status, 502);
  const data = await res.json();
  assert.equal(JSON.stringify(data).includes('535'), false);
  assert.equal(JSON.stringify(data).includes('secret-pass'), false);
});

test('без пароля SMTP сервис отвечает 500 и ничего не шлёт', async () => {
  const { fn, mails } = okSend();
  const res = await handle(post(validBody), { ...ENV, SMTP_PASS: '' }, fn);
  assert.equal(res.status, 500);
  assert.equal(mails.length, 0);
});

test('письмо собирается в UTF-8 с закодированной темой и base64-телом', () => {
  const msg = buildMessage(
    { from: 'HLTB <support@example.com>', to: ['owner@example.com'], reply_to: 'r@example.com', subject: 'Правка\r\nBcc: x@y', text: 'Устарел закон' },
    { messageId: 'id@example', date: 'Mon, 26 Oct 2026 10:00:00 GMT' },
  );
  const [headers] = msg.split('\r\n\r\n');
  assert.match(headers, /^From: HLTB <support@example.com>/m);
  assert.match(headers, /^Reply-To: r@example.com/m);
  assert.doesNotMatch(headers, /^Bcc:/m);
  assert.match(headers, /^Subject: =\?UTF-8\?B\?/m);
  assert.match(headers, /Content-Transfer-Encoding: base64/);
  const body = msg.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), 'Устарел закон');
});

test('точка в начале строки удваивается', () => {
  assert.equal(dotStuff('.a\r\n.b\r\nc'), '..a\r\n..b\r\nc');
});

test('buildMail: без контакта reply_to нет', () => {
  const mail = buildMail({ section: '1', item: '2', title: 't', url: '', text: 'текст', source: '', contact: '' }, ENV);
  assert.equal('reply_to' in mail, false);
  assert.equal(mail.to[0], ENV.TO_EMAIL);
});

// Фейковый SMTP-сервер на обычном TCP: проверяет последовательность команд и логин.
function fakeSmtp({ user, pass }) {
  const log = [];
  let dataMode = false, dataBuf = '';
  const server = net.createServer((sock) => {
    let buf = '';
    const say = (s) => sock.write(s + '\r\n');
    let stage = 'cmd';
    say('220 fake ready');
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (dataMode) {
          if (line === '.') { dataMode = false; log.push({ data: dataBuf }); dataBuf = ''; say('250 queued'); }
          else dataBuf += line + '\r\n';
          continue;
        }
        if (stage === 'login-user') { log.push({ cmd: 'AUTH-LOGIN-USER' }); stage = 'login-pass'; if (Buffer.from(line, 'base64').toString() !== user) return say('535 bad'); say('334 UGFzc3dvcmQ6'); continue; }
        if (stage === 'login-pass') { stage = 'ready'; if (Buffer.from(line, 'base64').toString() !== pass) return say('535 bad'); log.push({ cmd: 'AUTH-OK' }); say('235 ok'); continue; }
        const verb = line.split(' ')[0];
        log.push({ cmd: line });
        if (verb === 'EHLO') say('250-fake\r\n250 AUTH LOGIN');
        else if (line === 'AUTH LOGIN') { stage = 'login-user'; say('334 VXNlcm5hbWU6'); }
        else if (verb === 'MAIL' || verb === 'RCPT') say('250 ok');
        else if (line === 'DATA') { dataMode = true; say('354 go'); }
        else if (verb === 'QUIT') { say('221 bye'); sock.end(); }
        else say('500 unknown');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, log, port: server.address().port })));
}

test('sendSmtp проходит AUTH, MAIL, RCPT, DATA и отдаёт письмо', async () => {
  const fake = await fakeSmtp({ user: ENV.SMTP_USER, pass: ENV.SMTP_PASS });
  const connect = (opts) => {
    const s = net.connect(fake.port, '127.0.0.1');
    return { readable: Readable.toWeb(s), writable: Writable.toWeb(s), close: () => { s.destroy(); return Promise.resolve(); } };
  };
  try {
    await sendSmtp(ENV, buildMail({ section: '3', item: '12', title: 'П', url: '', text: 'Устарел закон', source: '', contact: 'r@example.com' }, ENV), connect);
  } finally {
    fake.server.close();
  }
  const cmds = fake.log.filter((x) => x.cmd).map((x) => x.cmd);
  assert.deepEqual(cmds.slice(0, 4), ['EHLO hltb-feedback', 'AUTH LOGIN', 'AUTH-LOGIN-USER', 'AUTH-OK']);
  assert.ok(cmds.includes('MAIL FROM:<support@example.com>'));
  assert.ok(cmds.includes('RCPT TO:<owner@example.com>'));
  const data = fake.log.find((x) => x.data).data;
  assert.match(data, /Reply-To: r@example\.com/);
  assert.match(data, /Content-Type: text\/plain; charset=utf-8/);
});

test('sendSmtp с неверным паролем бросает ошибку без пароля в тексте', async () => {
  const fake = await fakeSmtp({ user: ENV.SMTP_USER, pass: 'другой' });
  const connect = () => {
    const s = net.connect(fake.port, '127.0.0.1');
    return { readable: Readable.toWeb(s), writable: Writable.toWeb(s), close: () => { s.destroy(); return Promise.resolve(); } };
  };
  try {
    await assert.rejects(
      sendSmtp(ENV, buildMail({ section: '', item: '', title: '', url: '', text: 'текст тест', source: '', contact: '' }, ENV), connect),
      (err) => !String(err.message).includes(Buffer.from(ENV.SMTP_PASS).toString('base64')) && !String(err.message).includes(ENV.SMTP_PASS),
    );
  } finally {
    fake.server.close();
  }
});
