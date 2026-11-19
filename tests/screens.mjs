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
  { n: 6, kn: '', en: 'six' },
];
const PLANETS = [
  { id: 'mercury', name: 'Mercury', mark: 'crater', min: 4 },
  { id: 'venus', name: 'Venus', mark: 'swirl', min: 3 },
  { id: 'earth', name: 'Earth', mark: 'continent', min: 2 },
  { id: 'mars', name: 'Mars', mark: 'polar', min: 1 },
  { id: 'jupiter', name: 'Jupiter', mark: 'spot', min: 1 },
  { id: 'saturn', name: 'Saturn', mark: 'ring', min: 2 },
];
const SPLIT = {
  4: { stars: 4, piles: [2, 2], line: '2 and 2' },
  5: { stars: 5, piles: [3, 2], line: '3 and 2' },
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
    const selectors = ['#numeral', '#kannada', '#en', '#said', '#back', '#next', '#world-text', '.planet-art', '.planet-name', '#add-one', '.rocket', '.star', '.fact-num', '.fact-line', '.and'];
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
  const addLabel = n === 6 ? 'Back to 5' : 'Add one';
  assert(await page.locator('#add-one').getAttribute('aria-label') === addLabel, 'add control on ' + n);
  assert(await page.locator('#add-one').count() === 1, 'more than one add control');
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
    if (planet.id !== 'saturn') assert(item.marks.ring === 0, planet.name + ' is wearing rings');
    assert(item.nameSize >= 11, planet.name + ' label is ' + item.nameSize + 'px');
  });
  await assertLand(page);
  await audit(page, 'count ' + n);
}

async function assertStars(page, total, expected) {
  const fact = page.locator('#fact-' + total);
  assert(await fact.locator('.star').count() === expected.stars, total + ' shows ' + await fact.locator('.star').count() + ' stars');
  const piles = await fact.locator('.pile').evaluateAll((els) => els.map((el) => el.querySelectorAll('.star').length));
  assert(JSON.stringify(piles) === JSON.stringify(expected.piles), total + ' groups ' + JSON.stringify(piles));
  assert((await fact.locator('.fact-line').textContent()) === expected.line, total + ' line');
  const problems = await fact.evaluate((el) => {
    const problems = [];
    const centers = [];
    [...el.querySelectorAll('.pile')].forEach((pile, index) => {
      const stars = [...pile.querySelectorAll('.star')]
        .map((star) => star.getBoundingClientRect())
        .sort((a, b) => a.left - b.left);
      const gaps = [];
      for (let i = 1; i < stars.length; i++) {
        const gap = stars[i].left - stars[i - 1].right;
        if (gap <= 0.5) problems.push('group ' + index + ' stars overlap');
        gaps.push(gap);
      }
      gaps.forEach((gap) => {
        if (Math.abs(gap - gaps[0]) > 2) problems.push('group ' + index + ' gaps are uneven');
      });
      stars.forEach((rect) => {
        centers.push((rect.top + rect.bottom) / 2);
        if (Math.abs(rect.width - stars[0].width) > 1.5 || Math.abs(rect.height - stars[0].height) > 1.5) {
          problems.push('group ' + index + ' star sizes differ');
        }
        if (Math.abs(rect.top - stars[0].top) > 2) problems.push('group ' + index + ' stars are not level');
      });
    });
    centers.forEach((y) => {
      if (Math.abs(y - centers[0]) > 2) problems.push('stars in this fact are not on one line');
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
  await assertStars(page, 4, facts[4]);
  await assertStars(page, 5, facts[5]);
  const sameSize = await page.evaluate(() => {
    const widths = [...document.querySelectorAll('.star')].map((el) => el.getBoundingClientRect().width);
    return widths.every((width) => Math.abs(width - widths[0]) <= 1.5);
  });
  assert(sameSize, 'stars are different sizes on one screen');
  await assertLand(page);
  await audit(page, 'together ' + facts[4].line + ' / ' + facts[5].line);
}

async function walk(page, takeShots) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  await assertCounting(page, 1);
  assert(await page.locator('#back').isDisabled(), 'back is active on one');
  await page.locator('#blocks .cube').first().click();
  await assertCounting(page, 1);
  await page.locator('#next').click();
  await assertTogether(page, SPLIT);
  if (takeShots) await page.screenshot({ path: join(shots, 'together-split.png') });
  await page.locator('#back').click();
  await assertCounting(page, 1);

  for (let n = 2; n <= 6; n++) {
    await page.locator('#add-one').click();
    await assertCounting(page, n);
    if (takeShots && n === 5) await page.screenshot({ path: join(shots, 'counting-planets.png') });
    if (takeShots && n === 6) await page.screenshot({ path: join(shots, 'counting-saturn.png') });
  }

  await page.locator('#add-one').click();
  await assertCounting(page, 5);
  await page.locator('#next').click();
  await assertTogether(page, SPLIT);

  await page.locator('#fact-4 .pile').first().click();
  const joinedFour = {
    4: { stars: 4, piles: [4], line: '2 and 2 make 4' },
    5: SPLIT[5],
  };
  await assertTogether(page, joinedFour);
  if (takeShots) await page.screenshot({ path: join(shots, 'together-2-and-2.png') });

  await page.locator('#fact-4 .pile').first().click();
  await assertTogether(page, {
    4: { stars: 4, piles: [2, 2], line: '4 is 2 and 2' },
    5: SPLIT[5],
  });

  await page.locator('#fact-5 .pile').first().click();
  await assertTogether(page, {
    4: { stars: 4, piles: [2, 2], line: '4 is 2 and 2' },
    5: { stars: 5, piles: [5], line: '3 and 2 make 5' },
  });

  await page.locator('#fact-4 .pile').first().click();
  await assertTogether(page, {
    4: { stars: 4, piles: [4], line: '2 and 2 make 4' },
    5: { stars: 5, piles: [5], line: '3 and 2 make 5' },
  });
  if (takeShots) await page.screenshot({ path: join(shots, 'together-both-joined.png') });

  await page.locator('#back').click();
  await assertCounting(page, 5);
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
