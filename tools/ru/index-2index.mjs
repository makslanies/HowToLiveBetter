// Отправка страниц русской версии на индексацию через API 2index.ninja (https://2index.ninja/api-documentation).
// Токен берётся из .env (2INDEX_TOKEN) и никуда не печатается. Без --send скрипт только проверяет аккаунт и показывает план.
//   node tools/ru/index-2index.mjs --urls ru-work/index/urls.txt            план: проверка аккаунта и список адресов
//   node tools/ru/index-2index.mjs --urls ru-work/index/urls.txt --send     отправка (платная: списывается баланс)
// Опции: --project <имя> (howtolivebetter), --engines google,yandex,bing (все три), --batch 100
// Адреса берутся из файла (по одному в строке) или, если --urls не задан, из dist-ru/site/sitemap.xml при --sitemap.
import { readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const SEND = args.includes('--send');
const BASE = 'https://2index.ninja/api/v1';
const PROJECT = opt('project', 'howtolivebetter');
const ENGINES = new Set(opt('engines', 'google,yandex,bing').split(',').map((s) => s.trim()).filter(Boolean));
const BATCH = Number(opt('batch', '100'));

function token() {
  const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  const m = env.match(/^2INDEX_TOKEN=(.*)$/m);
  const t = (m ? m[1] : '').trim().replace(/^["']|["']$/g, '');
  if (!t) { console.error('в .env нет 2INDEX_TOKEN'); process.exit(2); }
  return t;
}
const TOKEN = token();

async function api(method, path, body) {
  const r = await fetch(`${BASE}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: r.status, json };
}

// адреса
let urls = [];
if (opt('urls', '')) {
  urls = readFileSync(opt('urls', ''), 'utf8').split('\n').map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
} else if (args.includes('--sitemap')) {
  const xml = readFileSync('dist-ru/site/sitemap.xml', 'utf8');
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
} else {
  console.error('укажите --urls <файл> или --sitemap'); process.exit(2);
}
urls = [...new Set(urls)];

// аккаунт
const acc = await api('GET', 'account');
if (acc.status !== 200 || !acc.json.success) { console.error('аккаунт не отвечает:', acc.status, JSON.stringify(acc.json).slice(0, 200)); process.exit(1); }
const a = acc.json.account;
console.log(`тариф ${a.tariff}, баланс $${a.balance}, проекты доступно ${a.available_projects}, ссылки доступно ${a.available_links}, цена ссылки ${a.link_cost}`);
console.log(`адресов к отправке: ${urls.length}, поисковики: ${[...ENGINES].join(', ')}, проект: ${PROJECT}`);
if (!urls.length) process.exit(0);
if (!SEND) { console.log('сухой прогон: добавьте --send, чтобы отправить'); urls.slice(0, 5).forEach((u) => console.log('  ' + u)); process.exit(0); }

const flags = { google: ENGINES.has('google'), yandex: ENGINES.has('yandex'), bing: ENGINES.has('bing') };
let sent = 0;
for (let i = 0; i < urls.length; i += BATCH) {
  const chunk = urls.slice(i, i + BATCH);
  const r = await api('POST', 'link/add_simple', { project_name: PROJECT, links: chunk, ...flags, google_access_granted: false });
  if (r.json.success) { sent += chunk.length; console.log(`отправлено ${chunk.length} (всего ${sent}), project_id ${r.json.project_id ?? '-'}`); }
  else { console.error(`ошибка на пачке ${i}:`, JSON.stringify(r.json).slice(0, 300)); process.exit(1); }
}
console.log(`готово: отправлено ${sent} из ${urls.length}`);
