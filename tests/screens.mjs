/**
 * Every counting screen and every together state, on phone viewports.
 *
 *   node tests/screens.mjs
 */
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const shots = '/opt/cursor/artifacts';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
};

const COUNTS = [
  { n: 1, kn: 'ಒಂದು', en: 'one' },
  { n: 2, kn: 'ಎರಡು', en: 'two' },
  { n: 3, kn: 'ಮೂರು', en: 'three' },
  { n: 4, kn: 'ನಾಲ್ಕು', en: 'four' },
  { n: 5, kn: 'ಐದು', en: 'five' },
  { n: 6, kn: 'ಆರು', en: 'six' },
  { n: 7, kn: 'ಏಳು', en: 'seven' },
  { n: 8, kn: 'ಎಂಟು', en: 'eight' },
];
const PLANETS = [
  { id: 'mercury', name: 'Mercury', mark: 'crater', min: 4 },
  { id: 'venus', name: 'Venus', mark: 'swirl', min: 3 },
  { id: 'earth', name: 'Earth', mark: 'continent', min: 2 },
  { id: 'mars', name: 'Mars', mark: 'polar', min: 1 },
  { id: 'jupiter', name: 'Jupiter', mark: 'spot', min: 1 },
  { id: 'saturn', name: 'Saturn', mark: 'ring', min: 2 },
  { id: 'uranus', name: 'Uranus', mark: 'ring', min: 2 },
  { id: 'neptune', name: 'Neptune', mark: 'band', min: 3 },
];
const FILLS = {
  gold: '#e4c56a',
  ice: '#8fb4d4',
  coral: '#e07a5f',
  mint: '#5eaea0',
};
const SPLIT = {
  4: { kind: 'star', count: 4, piles: [2, 2], tones: ['gold', 'gold', 'ice', 'ice'], line: '2 and 2' },
  5: { kind: 'rocket', count: 5, piles: [3, 2], tones: ['coral', 'coral', 'coral', 'mint', 'mint'], line: '3 and 2' },
};

const viewports = [
  { name: '390x844', width: 390, height: 844, shot: true },
  { name: '375x667', width: 375, height: 667 },
  { name: '320x700', width: 320, height: 700 },
  { name: '844x390', width: 844, height: 390 },
  { name: '667x375', width: 667, height: 375 },
  { name: '700x320', width: 700, height: 320 },
];

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!path.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    res.writeHead(err && err.code === 'ENOENT' ? 404 : 500);
    res.end();
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port + '/index.html';

async function audit(page, label) {
  const problems = await page.evaluate(() => {
    function shown(el) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0.5 && rect.height > 0.5;
    }
    function clipped(el) {
      const rect = el.getBoundingClientRect();
      let left = rect.left;
      let top = rect.top;
      let right = rect.right;
      let bottom = rect.bottom;
      let node = el.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        const clips = (value) => value === 'hidden' || value === 'auto' || value === 'scroll' || value === 'clip';
        const box = node.getBoundingClientRect();
        if (clips(style.overflowX)) {
          left = Math.max(left, box.left);
          right = Math.min(right, box.right);
        }
        if (clips(style.overflowY)) {
          top = Math.max(top, box.top);
          bottom = Math.min(bottom, box.bottom);
        }
        node = node.parentElement;
      }
      left = Math.max(0, left);
      top = Math.max(0, top);
      right = Math.min(window.innerWidth, right);
      bottom = Math.min(window.innerHeight, bottom);
      return right - left < rect.width - 1 || bottom - top < rect.height - 1;
    }
    const problems = [];
    const nodes = [];
    const selectors = ['#numeral', '#kannada', '#en', '#said', '#back', '#next', '#world-text', '.planet-art', '.planet-name', '#add-one', '.rocket', '.token', '.join', '.fact-num', '.fact-line', '.and'];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el, index) => {
        if (!shown(el)) return;
        const text = (el.textContent || '').trim();
        if ((sel === '#kannada' || sel === '#en' || sel === '#said') && !text) return;
        nodes.push({ el, sel, name: text || sel + ' ' + index });
      });
    });
    nodes.forEach((item) => {
      if (clipped(item.el)) problems.push(item.sel + ' "' + item.name + '" is clipped');
      const size = parseFloat(getComputedStyle(item.el).fontSize);
      const text = (item.el.textContent || '').trim();
      if (text && size < 16) problems.push(item.sel + ' "' + item.name + '" is ' + size + 'px');
    });
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ra = a.el.getBoundingClientRect();
        const rb = b.el.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 1 && h > 1) problems.push(a.sel + ' "' + a.name + '" overlaps ' + b.sel + ' "' + b.name + '"');
      }
    }
    return problems;
  });
  assert(problems.length === 0, label + '\n' + problems.join('\n'));
}

async function assertLand(page) {
  const ok = await page.evaluate(() => {
    const land = window.innerHeight < 520 && window.innerWidth > window.innerHeight;
    return document.documentElement.classList.contains('land') === land;
  });
  assert(ok, 'landscape class does not match the viewport');
}

async function assertCounting(page, n) {
  const info = COUNTS[n - 1];
  assert((await page.locator('#numeral').textContent()) === String(n), 'numeral ' + n);
  assert((await page.locator('#kannada').textContent()) === info.kn, 'kannada for ' + n);
  assert((await page.locator('#en').textContent()) === info.en, 'english for ' + n);
  assert(await page.locator('#screen-number').getAttribute('data-n') === String(n), 'screen ' + n);
  assert(await page.locator('#blocks .cube').count() === n, 'planet count ' + n);
  assert((await page.locator('#next').textContent()) === 'Together', 'counting screen still has a next arrow');
  assert(await page.locator('#next').getAttribute('aria-label') === 'Together', 'together label');
  assert(await page.locator('[aria-label="Next"]').count() === 0, 'a Next control is still on the page');
  assert(await page.locator('button', { hasText: /^›$/ }).count() === 0, 'the next arrow is still a control');
  if (n < 8) {
    assert(await page.locator('#add-one').getAttribute('aria-label') === 'Add one', 'add control on ' + n);
    assert((await page.locator('#add-one').textContent()) === '+', 'add control is not + on ' + n);
    assert(await page.locator('button', { hasText: /^\+$/ }).count() === 1, 'more than one add control');
  } else {
    assert(await page.locator('#add-one').count() === 0, 'screen 8 still offers another planet');
    assert(await page.locator('button', { hasText: /^\+$/ }).count() === 0, 'a plus control is still on screen 8');
  }
  const seen = await page.locator('#blocks .cube').evaluateAll((els) => els.map((el) => ({
    id: el.getAttribute('data-planet'),
    name: el.querySelector('.planet-name').textContent,
    marks: {
      crater: el.querySelectorAll('[data-crater]').length,
      swirl: el.querySelectorAll('[data-swirl]').length,
      continent: el.querySelectorAll('[data-continent]').length,
      polar: el.querySelectorAll('[data-polar]').length,
      spot: el.querySelectorAll('[data-spot]').length,
      band: el.querySelectorAll('[data-band]').length,
      ring: el.querySelectorAll('[data-ring]').length,
      tilt: el.querySelectorAll('[data-tilt]').length,
    },
    svg: el.querySelector('svg').outerHTML,
    nameSize: parseFloat(getComputedStyle(el.querySelector('.planet-name')).fontSize),
  })));
  assert(new Set(seen.map((item) => item.svg)).size === seen.length, 'planets share one drawing');
  seen.forEach((item, index) => {
    const planet = PLANETS[index];
    assert(item.id === planet.id, 'order got ' + item.id + ' at ' + index);
    assert(item.name === planet.name, 'label ' + item.name);
    assert(item.marks[planet.mark] >= planet.min, planet.name + ' is missing its ' + planet.mark);
    if (planet.id === 'jupiter') assert(item.marks.band >= 4, 'Jupiter has no bands');
    if (planet.id !== 'saturn' && planet.id !== 'uranus') assert(item.marks.ring === 0, planet.name + ' is wearing rings');
    if (planet.id === 'uranus') {
      assert(item.marks.tilt >= 1, 'Uranus ring is not tilted');
      assert(item.svg.includes('rotate(-26'), 'Uranus ring is level');
      assert(item.svg.includes('#73d0e2'), 'Uranus is not ice blue');
      assert(item.marks.continent === 0, 'Uranus has continents');
    }
    if (planet.id === 'neptune') {
      assert(item.marks.continent === 0, 'Neptune has continents');
      assert(item.svg.includes('#2a4ec0'), 'Neptune is not royal blue');
      assert(item.svg.includes('#0c1c6e'), 'Neptune is missing its deep blue');
    }
    if (planet.id === 'saturn') {
      assert(item.marks.tilt === 0, 'Saturn ring is tilted');
      assert(item.svg.includes('#e6d2a2'), 'Saturn lost its gold ring');
    }
    if (planet.id === 'earth') assert(item.marks.continent >= 2, 'Earth lost its land');
    assert(item.nameSize >= 16, planet.name + ' label is ' + item.nameSize + 'px');
  });
  await assertLand(page);
  await audit(page, 'count ' + n);
}

async function assertFact(page, total, expected) {
  const fact = page.locator('#fact-' + total);
  assert(await fact.getAttribute('data-kind') === expected.kind, total + ' kind');
  assert(await fact.locator('.token').count() === expected.count, total + ' shows ' + await fact.locator('.token').count());
  if (expected.kind === 'star') {
    assert(await fact.locator('.star').count() === expected.count, total + ' stars');
    assert(await fact.locator('.ship').count() === 0, 'rockets leaked into the star fact');
  } else {
    assert(await fact.locator('.ship').count() === expected.count, total + ' rockets');
    assert(await fact.locator('.star').count() === 0, 'stars leaked into the rocket fact');
  }
  const piles = await fact.locator('.pile').evaluateAll((els) => els.map((el) => el.querySelectorAll('.token').length));
  assert(JSON.stringify(piles) === JSON.stringify(expected.piles), total + ' groups ' + JSON.stringify(piles));
  const tones = await fact.locator('.token').evaluateAll((els) => els.map((el) => el.getAttribute('data-tone')));
  assert(JSON.stringify(tones) === JSON.stringify(expected.tones), total + ' tones ' + JSON.stringify(tones));
  const fills = await fact.locator('.token').evaluateAll((els) => els.map((el) => {
    const body = el.querySelector('[data-body]');
    const path = body || el.querySelector('path');
    return (path.getAttribute('fill') || '').toLowerCase();
  }));
  const expectFills = expected.tones.map((tone) => FILLS[tone]);
  assert(JSON.stringify(fills) === JSON.stringify(expectFills), total + ' fills ' + JSON.stringify(fills));
  assert(new Set(fills).size === 2, total + ' does not keep two colors');
  assert((await fact.locator('.fact-line').textContent()) === expected.line, total + ' line');
  assert((await fact.locator('.join').textContent()) === (expected.piles.length === 1 ? 'Split' : 'Join'), total + ' join label');
  const problems = await fact.evaluate((el) => {
    const problems = [];
    const pileCenters = [];
    [...el.querySelectorAll('.pile')].forEach((pile, index) => {
      const vertical = getComputedStyle(pile).flexDirection.indexOf('column') === 0;
      const stars = [...pile.querySelectorAll('.token')].map((star) => star.getBoundingClientRect());
      const ordered = stars.slice().sort((a, b) => (vertical ? a.top - b.top : a.left - b.left));
      const gaps = [];
      for (let i = 1; i < ordered.length; i++) {
        const gap = vertical
          ? ordered[i].top - ordered[i - 1].bottom
          : ordered[i].left - ordered[i - 1].right;
        if (gap <= 0.5) problems.push('group ' + index + ' stars overlap');
        gaps.push(gap);
      }
      gaps.forEach((gap) => {
        if (Math.abs(gap - gaps[0]) > 2) problems.push('group ' + index + ' gaps are uneven');
      });
      ordered.forEach((rect) => {
        if (Math.abs(rect.width - ordered[0].width) > 1.5 || Math.abs(rect.height - ordered[0].height) > 1.5) {
          problems.push('group ' + index + ' star sizes differ');
        }
        if (vertical) {
          const mid = (rect.left + rect.right) / 2;
          const mid0 = (ordered[0].left + ordered[0].right) / 2;
          if (Math.abs(mid - mid0) > 2) problems.push('group ' + index + ' stars are not centered');
        } else if (Math.abs(rect.top - ordered[0].top) > 2) {
          problems.push('group ' + index + ' stars are not level');
        }
      });
      const box = pile.getBoundingClientRect();
      pileCenters.push((box.top + box.bottom) / 2);
    });
    pileCenters.forEach((y) => {
      if (Math.abs(y - pileCenters[0]) > 3) problems.push('groups in this fact are not aligned');
    });
    return problems;
  });
  assert(problems.length === 0, 'fact ' + total + ': ' + problems.join('; '));
}

async function assertTogether(page, facts) {
  assert((await page.locator('#numeral').textContent()) === 'Together', 'together title');
  assert(await page.locator('#blocks').count() === 0, 'planets leaked onto together');
  assert(await page.locator('#next').getAttribute('aria-label') === 'Again', 'reset control');
  assert(await page.locator('#add-one').count() === 0, 'add control is on the addition screen');
  await assertFact(page, 4, facts[4]);
  await assertFact(page, 5, facts[5]);
  const sameSize = await page.evaluate(() => {
    const widths = [...document.querySelectorAll('.token')].map((el) => el.getBoundingClientRect().width);
    return widths.every((width) => Math.abs(width - widths[0]) <= 1.5);
  });
  assert(sameSize, 'stars and rockets are different sizes on one screen');
  await assertLand(page);
  await audit(page, 'together ' + facts[4].line + ' / ' + facts[5].line);
}

async function walk(page, takeShots) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const fontReady = await page.evaluate(() => document.fonts.check('32px "Blocks Kannada"'));
  assert(fontReady, 'Kannada font did not load');

  await assertCounting(page, 1);
  assert(await page.locator('#back').isDisabled(), 'back is active on one');
  await page.locator('[data-planet="mercury"]').click();
  await assertCounting(page, 1);
  assert((await page.locator('#said').textContent()) === 'Mercury, one', 'mercury speech line');
  assert(await page.locator('[data-planet="mercury"]').evaluate((el) => el.classList.contains('counted')), 'mercury did not glow');

  await page.locator('#next').click();
  await assertTogether(page, SPLIT);
  if (takeShots) await page.screenshot({ path: join(shots, 'together-split.png') });

  await page.locator('#fact-4 .token').nth(1).click();
  await assertTogether(page, SPLIT);
  assert(await page.locator('#fact-4 .token.is-lit').count() === 1, 'star tap did not light');
  assert((await page.locator('#said').textContent()) === 'two', 'second star did not count two');
  await page.locator('#fact-5 .token').nth(3).click();
  await assertTogether(page, SPLIT);
  assert((await page.locator('#said').textContent()) === 'one', 'first rocket of the second group did not count one');
  assert(await page.locator('#fact-5 .ship.is-lit').count() === 1, 'rocket tap did not light');

  await page.locator('#back').click();
  await assertCounting(page, 1);

  for (let n = 2; n <= 8; n++) {
    await page.locator('#add-one').click();
    await assertCounting(page, n);
    if (takeShots && n === 8) await page.screenshot({ path: join(shots, 'counting-eight.png') });
  }

  await page.locator('[data-planet="uranus"]').click();
  assert((await page.locator('#said').textContent()) === 'Uranus, seven', 'uranus speech line');
  await page.locator('[data-planet="neptune"]').click();
  assert((await page.locator('#said').textContent()) === 'Neptune, eight', 'neptune speech line');
  await assertCounting(page, 8);

  await page.locator('#next').click();
  await assertTogether(page, SPLIT);

  await page.locator('#fact-4 .join').click();
  const joinedFour = {
    4: { kind: 'star', count: 4, piles: [4], tones: ['gold', 'gold', 'ice', 'ice'], line: '2 and 2 make 4' },
    5: SPLIT[5],
  };
  await assertTogether(page, joinedFour);

  await page.locator('#fact-4 .join').click();
  await assertTogether(page, {
    4: { kind: 'star', count: 4, piles: [2, 2], tones: ['gold', 'gold', 'ice', 'ice'], line: '4 is 2 and 2' },
    5: SPLIT[5],
  });

  await page.locator('#fact-5 .join').click();
  await assertTogether(page, {
    4: { kind: 'star', count: 4, piles: [2, 2], tones: ['gold', 'gold', 'ice', 'ice'], line: '4 is 2 and 2' },
    5: { kind: 'rocket', count: 5, piles: [5], tones: ['coral', 'coral', 'coral', 'mint', 'mint'], line: '3 and 2 make 5' },
  });

  await page.locator('#fact-4 .join').click();
  const both = {
    4: { kind: 'star', count: 4, piles: [4], tones: ['gold', 'gold', 'ice', 'ice'], line: '2 and 2 make 4' },
    5: { kind: 'rocket', count: 5, piles: [5], tones: ['coral', 'coral', 'coral', 'mint', 'mint'], line: '3 and 2 make 5' },
  };
  await assertTogether(page, both);
  if (takeShots) await page.screenshot({ path: join(shots, 'together-joined.png') });

  await page.locator('#fact-5 .ship').nth(4).click();
  assert((await page.locator('#said').textContent()) === 'five', 'joined rockets did not count to five');
  await page.locator('#fact-4 .star').nth(3).click();
  assert((await page.locator('#said').textContent()) === 'four', 'joined stars did not count to four');
  await assertTogether(page, both);

  await page.locator('#back').click();
  await assertCounting(page, 8);
  await page.locator('#next').click();
  await page.locator('#next').click();
  await assertCounting(page, 1);

  await page.locator('#add-one').click();
  await page.locator('#add-one').click();
  await page.locator('#add-one').click();
  await assertCounting(page, 4);
  await page.locator('#next').click();
  await page.locator('#back').click();
  await assertCounting(page, 4);
  await page.locator('#back').click();
  await assertCounting(page, 3);
}

await mkdir(shots, { recursive: true });
const browser = await webkit.launch({ headless: true });
const failures = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('response', (res) => {
      if (res.status() >= 400) errors.push(res.status() + ' ' + res.url());
    });
    try {
      await walk(page, viewport.shot);
      assert(errors.length === 0, 'errors\n' + errors.join('\n'));
      console.log('screens ' + viewport.name + ' passed');
    } catch (err) {
      const file = join(shots, 'fail-' + viewport.name + '.png');
      await page.screenshot({ path: file }).catch(() => {});
      failures.push(viewport.name + ': ' + err.message + '\n(screenshot ' + file + ')');
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(failures.join('\n\n'));
  process.exitCode = 1;
} else {
  console.log('all screens passed');
}
