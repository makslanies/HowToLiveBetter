import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('publish excludes unreviewed and rejected prices and removes stale overlay rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ru-prices-test-'));
  const json = (path, data) => writeFileSync(join(dir, path), JSON.stringify(data));
  try {
    mkdirSync(join(dir, 'ru/book'), { recursive: true });
    mkdirSync(join(dir, 'ru-work/prices'), { recursive: true });
    mkdirSync(join(dir, 'ru-work/overlay'), { recursive: true });
    writeFileSync(join(dir, 'ru/book/01-first.md'), '');
    writeFileSync(join(dir, 'ru/book/02-second.md'), '');
    const base = { what: 'товар', unit: 'за штуку', ok: true, min_rub: 0.5, max_rub: 2, at: '2026-10-06', good: [{ url: 'https://example.org/price', price_rub: 0.5 }], entries: ['1-1'] };
    json('ru-work/prices/verified.json', {
      pending: base,
      rejected: { ...base, review: false, entries: ['2-1'] },
      accepted: { ...base, review: true, entries: ['1-2'] },
      missingPeriod: { ...base, review: true, unit: 'в год', entries: ['1-3'] },
      packageOnly: { ...base, review: true, price_only: true, unit: 'за курс', pack: 'упаковка 7 пластырей', packs_min: 8, packs_max: 12, entries: ['1-4'] },
    });
    json('ru-work/overlay/02-second.json', [{ entry: 1, kind: 'price', lines: ['старая цена'] }, { entry: 2, lines: ['- В России: сохранить'] }]);
    const run = () => {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./prices.mjs', import.meta.url)), 'publish'], { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    };
    run();
    const first = JSON.parse(readFileSync(join(dir, 'ru-work/overlay/01-first.json'), 'utf8'));
    assert.deepEqual(first.map((x) => x.entry), [2, 4]);
    assert.match(first[0].lines[0], /0,5/);
    assert.match(first[0].lines[1], /Источники цен \(Россия\): \[example.org — товар: 0,5 ₽\]/);
    assert.match(first[0].lines[1], /проверено 06.10.2026/);
    assert.doesNotMatch(first[0].lines[0], /https:/);
    assert.match(first[1].lines[0], /не расход за месяц, год или полный курс/);
    assert.doesNotMatch(first[1].lines[0], /нужно около/);
    const second = JSON.parse(readFileSync(join(dir, 'ru-work/overlay/02-second.json'), 'utf8'));
    assert.deepEqual(second, [{ entry: 2, lines: ['- В России: сохранить'] }]);
    const before = readFileSync(join(dir, 'ru-work/overlay/01-first.json'), 'utf8');
    run();
    assert.equal(readFileSync(join(dir, 'ru-work/overlay/01-first.json'), 'utf8'), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('manual import is atomic and requires independent sources and supported examples', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ru-prices-import-'));
  try {
    mkdirSync(join(dir, 'ru-work/prices'), { recursive: true });
    const path = join(dir, 'ru-work/prices/verified.json');
    const original = JSON.stringify({ item: { unit: 'за курс', entries: ['1-1'], review: false } });
    writeFileSync(path, original);
    const good = [{ url: 'https://one.example/p', price_rub: 100, quote: '100' }, { url: 'https://two.example/p', price_rub: 200, quote: '200' }];
    const accepted = { key: 'item', status: 'accepted', reason: 'Только упаковка', what: 'товар', unit: 'за упаковку', at: '2026-10-06', min_rub: 100, max_rub: 200, good };
    const run = (decisions) => {
      const file = join(dir, 'decisions.json');
      writeFileSync(file, JSON.stringify(decisions));
      return spawnSync(process.execPath, [fileURLToPath(new URL('./prices.mjs', import.meta.url)), 'import-manual', '--file', file], { cwd: dir, encoding: 'utf8' });
    };
    assert.notEqual(run([accepted, { key: 'missing', status: 'rejected', reason: 'Нет' }]).status, 0);
    assert.equal(readFileSync(path, 'utf8'), original);
    assert.notEqual(run([{ ...accepted, good: [good[0], { ...good[1], url: 'https://www.one.example/p2' }] }]).status, 0);
    assert.notEqual(run([{ ...accepted, examples: [{ label: 'пример', unit: 'за упаковку', url: good[0].url, price_rub: 999 }] }]).status, 0);
    assert.equal(run([accepted]).status, 0);
    const imported = JSON.parse(readFileSync(path, 'utf8')).item;
    assert.equal(imported.unit, 'за курс');
    assert.equal(imported.display_unit, 'за упаковку');
    assert.equal(imported.review, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
