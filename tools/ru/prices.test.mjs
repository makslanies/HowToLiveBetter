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
    const base = { what: 'товар', unit: 'за штуку', ok: true, min_rub: 0.5, max_rub: 2, at: '2026-10-06', good: [{ url: 'https://example.org/price' }], entries: ['1-1'] };
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
    assert.match(first[1].lines[0], /не является ценой курса/);
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
