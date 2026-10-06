import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { parseBook, keyOf } from './parse.mjs';
import { countryView, countrySummary, sourceGroups } from './country-fields.mjs';

const sections = parseBook();
const entries = sections.flatMap((s) => s.entries);
const scope = JSON.parse(readFileSync('ru/scope.json', 'utf8'));
const html = readFileSync('ru/index.html', 'utf8');

test('browser and static parsers agree on every country field and source', () => {
  const context = vm.createContext({});
  const model = readFileSync('tools/ru/country-fields.mjs', 'utf8').replace(/^export /gm, '');
  const parser = html.slice(html.indexOf('function parseReadme(md){'), html.indexOf('/* ---------- 术语表'));
  vm.runInContext(`const COST_W = {money:{},time:{},will:{}};\n${model}\n${parser}`, context);
  for (const s of sections) {
    context.md = readFileSync(`ru/book/${s.file}`, 'utf8');
    const browser = vm.runInContext('parseReadme(md)[0].entries', context);
    assert.equal(browser.length, s.entries.length);
    for (let i = 0; i < browser.length; i++) {
      for (const field of ['title', 'human', 'cost', 'gain', 'note', 'ru', 'price', 'srcOriginal', 'srcRussia', 'srcPrices']) {
        assert.equal(browser[i][field], s.entries[i][field], `${s.n}-${i + 1}: ${field}`);
      }
    }
  }
});

test('all existing Russian supplements have four fields and retain separate sources', () => {
  const russian = entries.filter((e) => e.ru);
  assert.ok(russian.length >= 16);
  for (const e of russian) {
    assert.deepEqual(Object.keys(e.russian).sort(), ['cost', 'gain', 'human', 'note']);
    assert.ok(e.srcRussia, keyOf(e));
    assert.doesNotMatch(e.ru, /https?:\/\//, keyOf(e));
    assert.match(countrySummary(e, scope[keyOf(e)]), /Россия:/);
    assert.match(countryView(e, scope[keyOf(e)]).notice, /частичная/);
  }
});

test('prices alone never claim a Russian legal or medical variant', () => {
  const priced = entries.filter((e) => e.price && !e.ru);
  assert.ok(priced.length);
  for (const e of priced) {
    assert.equal(countryView(e, scope[keyOf(e)]).russian, null);
    assert.ok(sourceGroups(e, scope[keyOf(e)]).some((g) => g.title === 'Россия — источники цен'));
  }
  const unknown = countryView({ ru: 'Legacy supplement' }, { t: 'c' });
  assert.match(unknown.russian.cost, /не проверена/);
  assert.equal(unknown.russian.gain, 'Legacy supplement');
});

test('generated browser code compiles and country renderer preserves both variants', () => {
  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script[1]);
  }
  const element = () => ({ children: [], hidden: false, textContent: '', append(...children) { this.children.push(...children); } });
  const context = vm.createContext({ document: { createElement: element }, renderText: (el, text) => { el.textContent = text; } });
  vm.runInContext(readFileSync('tools/ru/spa/country-card.js', 'utf8'), context);
  context.el = element(); context.e = { gain: 'Chinese conditions' }; context.view = { labeled: true, original: 'Китай', russian: { gain: 'Russian conditions' } };
  vm.runInContext("renderCountryField(el, 'gain', e, view, [])", context);
  assert.equal(context.el.children.length, 2);
  assert.equal(context.el.children[0].children[1].textContent, 'Chinese conditions');
  assert.equal(context.el.children[1].children[1].textContent, 'Russian conditions');
  assert.doesNotMatch(html, /class="k ru-k"|Российские данные есть в строке|Запись целиком описывает/);
});

test('every generated entry, section and common page uses country-aware structure', () => {
  for (const e of entries) {
    const page = readFileSync(`dist-ru/site/p/${keyOf(e)}/index.html`, 'utf8');
    assert.match(page, /Оценки выше относятся к исходной версии/);
    assert.doesNotMatch(page, /В России \(российские данные\)|строка «В России»|Запись целиком описывает/);
    if (e.ru) {
      for (const field of ['human', 'cost', 'gain', 'note']) {
        const block = new RegExp(`data-field="${field}"[\\s\\S]*?<\\/section>`).exec(page)?.[0];
        assert.ok(block, `${keyOf(e)}: ${field}`);
        assert.match(block, /<strong>Россия\.<\/strong>/);
      }
      assert.match(page, /Россия — источники<\/h3>/);
    }
  }
  for (const s of sections) {
    const page = readFileSync(`dist-ru/site/s/${s.n}/index.html`, 'utf8');
    assert.match(page, /Введение ниже относится к исходной версии/);
    assert.match(page, /Российские данные есть у/);
  }
  for (const path of ['index.html', 'contents/index.html', 'about/index.html', 'privacy/index.html']) {
    const page = readFileSync(`dist-ru/site/${path}`, 'utf8');
    assert.match(page, /Китайские условия и российские данные разделены/);
    assert.doesNotMatch(page, /строка «В России»|блок «В России»/);
  }
  assert.equal(readdirSync('dist-ru/site/p').length, entries.length);
});
