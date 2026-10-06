// Переименовывает ru/book/NN-<китайское имя>.md в NN-<латинский slug>.md, переносит слой правок
// ru-work/overlay/ и чинит ссылки на длинные статьи (их в русской версии нет, ведём на оригинал).
// Ключ везде — двузначный номер раздела, поэтому скрипт можно запускать повторно.
//   node tools/ru/rename.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync, renameSync, existsSync } from 'node:fs';

const dry = process.argv.includes('--dry-run');
export const SLUGS = {
  '01': 'ne-umirat-rano', '02': 'ne-umirat-medlenno', '03': 'ne-tratit-sily', '04': 'ne-tratit-vremya',
  '05': 'ne-tratit-dengi', '06': 'lozhnye-vygody', '07': 'kogda-net-deneg', '08': 'zakon-i-imushchestvo',
  '09': 'krasnye-linii-zakona', '10': 'lyubov-i-brak', '11': 'krasnye-linii-programmistov', '12': 'svoe-delo',
  '13': 'ekstrennye-situatsii', '14': 'akkaunty-i-bezopasnost', '15': 'arenda-i-pokupka-zhilya', '16': 'zhizn-s-khronicheskoi-boleznyu',
  '17': 'pozhilye-v-dome', '18': 'stoit-li-rastit-detei', '19': 'rabota-uvolnenie-travma', '20': 'novorozhdennyi',
  '21': 'poezdki-za-granitsu', '22': 'otdykh', '23': 'kakie-navyki-stoyat', '24': 'lechenie',
  '25': 'posle-smerti-blizkogo', '26': 'sait-ili-platforma', '27': 'beremennost-i-rody', '28': 'vneshnost-i-zdorove',
  '29': 'posle-tyazhelogo-udara', '30': 'shkolnyi-vozrast', '31': 'puti-posle-18', '32': 'uchyoba-za-granitsei',
  '33': 'zhizn-s-invalidnostyu', '34': 'domashnyaya-aptechka',
};
const UPSTREAM = 'https://github.com/eternity4719/HowToLiveBetter/blob/main/docs/';

const files = readdirSync('ru/book').filter((f) => /^\d\d-.+\.md$/.test(f));
let moved = 0;
for (const f of files) {
  const nn = f.slice(0, 2);
  const slug = SLUGS[nn];
  if (!slug) { console.error(`нет slug для ${nn}`); continue; }
  const target = `${nn}-${slug}.md`;
  let text = readFileSync(`ru/book/${f}`, 'utf8');
  // ../docs/X.md → оригинал на GitHub (долгие статьи не переведены)
  const fixed = text.replace(/\]\(\.\.\/docs\/([^)\s#]+\.md)(#[^)\s]*)?\)/g, (_, p, h) => `](${UPSTREAM}${p.split('/').map((s) => (/%/.test(s) ? s : encodeURIComponent(s))).join('/')}${h || ''})`);
  if (dry) { console.log(`${f} -> ${target}${fixed !== text ? ' (+ссылки на docs)' : ''}`); continue; }
  if (fixed !== text) writeFileSync(`ru/book/${f}`, fixed);
  if (f !== target) { renameSync(`ru/book/${f}`, `ru/book/${target}`); moved++; }
  // слой правок: ru-work/overlay/<старое имя>.json → <новое>.json
  const ov = `ru-work/overlay/${f.replace(/\.md$/, '.json')}`;
  if (f !== target && existsSync(ov)) renameSync(ov, `ru-work/overlay/${target.replace(/\.md$/, '.json')}`);
}
console.error(dry ? 'пробный прогон, ничего не изменено' : `переименовано файлов: ${moved}`);
