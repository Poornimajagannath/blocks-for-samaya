/**
 * iPhone-viewport voice check for Blocks for Samaya.
 *
 * The first clip's audio.play() runs inside the tap, and that promise fulfills.
 * Nothing speaks or plays before the tap. Web Speech stays unused when the
 * clips load. Kannada words, the tower, and Together still work.
 *
 *   node tests/audio-iphone.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit, devices } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
};

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
const iphone = devices['iPhone 13'];

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function arm(page) {
  await page.addInitScript(() => {
    window.__speaks = [];
    window.__plays = [];
    window.__utterances = [];
    window.__audioContexts = 0;
    window.__intervals = [];
    window.__resumes = 0;
    const origInterval = window.setInterval.bind(window);
    window.setInterval = function (fn, ms) {
      window.__intervals.push(ms);
      return origInterval(fn, ms);
    };
    ['AudioContext', 'webkitAudioContext'].forEach((name) => {
      const Orig = window[name];
      if (typeof Orig !== 'function') return;
      window[name] = function WrappedAudio() {
        window.__audioContexts += 1;
        return new Orig(...arguments);
      };
      window[name].prototype = Orig.prototype;
    });
    const origPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function () {
      const rec = {
        line: this.getAttribute('data-line'),
        muted: this.muted,
        volume: this.volume,
        during: !!(window.event && /^(click|pointerup|pointerdown|touchend|touchstart)$/.test(window.event.type)),
        settled: 'pending',
      };
      window.__plays.push(rec);
      let pendingPlay;
      try {
        pendingPlay = origPlay.apply(this, arguments);
      } catch (err) {
        rec.settled = 'throw ' + (err && err.name);
        throw err;
      }
      if (pendingPlay && pendingPlay.then) {
        pendingPlay.then(function () { rec.settled = 'ok'; }, function (err) {
          rec.settled = 'err ' + (err && err.name);
        });
      } else rec.settled = 'ok';
      return pendingPlay;
    };
    const tapped = new WeakSet();
    function tapSynth() {
      const synth = window.speechSynthesis;
      if (!synth || tapped.has(synth)) return;
      try {
        const orig = synth.speak.bind(synth);
        synth.speak = function (utterance) {
          const text = String(utterance && utterance.text);
          window.__speaks.push(text);
          window.__utterances.push({
            text,
            lang: utterance && utterance.lang,
            rate: utterance && utterance.rate,
            t: performance.now(),
          });
          return orig.apply(this, arguments);
        };
        if (synth.resume) {
          const origResume = synth.resume.bind(synth);
          synth.resume = function () {
            window.__resumes += 1;
            return origResume.apply(this, arguments);
          };
        }
        tapped.add(synth);
      } catch (err) {
        window.__armError = String(err);
      }
    }
    tapSynth();
    window.setInterval(tapSynth, 20);
  });
}

async function openPhone(browser) {
  const extra = await browser.newPage({ ...iphone });
  const errors = [];
  extra.on('pageerror', (err) => errors.push(err.message));
  extra.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  extra.on('response', (res) => {
    if (res.status() >= 400) errors.push(res.status() + ' ' + res.url());
  });
  await arm(extra);
  await extra.goto(base, { waitUntil: 'load' });
  return { extra, errors };
}

async function checkCancelGap() {
  const browser = await webkit.launch({ headless: true });
  const { extra, errors } = await openPhone(browser);
  try {
    await extra.evaluate(() => {
      document.querySelectorAll('audio').forEach((el) => el.setAttribute('data-broken', '1'));
      const synth = window.speechSynthesis;
      window.__speaking = false;
      window.__speechLog = [];
      Object.defineProperty(synth, 'speaking', {
        configurable: true,
        get() { return window.__speaking; },
      });
      Object.defineProperty(synth, 'pending', {
        configurable: true,
        get() { return false; },
      });
      synth.cancel = () => {
        window.__speechLog.push({ type: 'cancel', t: performance.now() });
        window.__speaking = false;
      };
      synth.speak = (utterance) => {
        window.__speechLog.push({
          type: 'speak',
          t: performance.now(),
          text: String(utterance.text),
          lang: utterance.lang,
        });
        window.__speaking = true;
      };
    });
    await extra.locator('#blocks .cube').click();
    await extra.waitForFunction(() => window.__speechLog.some((item) => item.type === 'speak' && item.text === 'one'));
    const quiet = await extra.evaluate(() => window.__speechLog.slice());
    assert(quiet.some((item) => item.type === 'speak' && item.text === 'one'), 'fallback did not speak one');
    assert(!quiet.some((item) => item.type === 'cancel'), 'cancel ran while nothing was speaking');

    await extra.evaluate(() => {
      window.__speaking = true;
      window.__speechLog = [];
    });
    await extra.locator('#add-one').click();
    await extra.waitForFunction(() => window.__speechLog.some((item) => item.type === 'speak'));
    const gap = await extra.evaluate(() => {
      const log = window.__speechLog;
      const cancel = log.find((item) => item.type === 'cancel');
      const speak = log.find((item) => item.type === 'speak');
      return {
        text: speak && speak.text,
        dt: cancel && speak ? speak.t - cancel.t : -1,
        first: log[0] && log[0].type,
      };
    });
    assert(gap.first === 'cancel', 'busy speech was not cancelled before the next line');
    assert(gap.text === '1 and 1 make 2', 'gap spoke ' + gap.text);
    assert(gap.dt >= 60, 'cancel and speak ran in the same turn (' + gap.dt + 'ms)');
    assert(errors.length === 0, 'gap errors ' + errors.join('\n'));
  } finally {
    await extra.close();
    await browser.close();
  }
}

async function checkKannadaFallback() {
  const browser = await webkit.launch({ headless: true });
  const { extra, errors } = await openPhone(browser);
  try {
    await extra.evaluate(() => {
      document.querySelector('audio[data-line="ಒಂದು"]').setAttribute('data-broken', '1');
    });
    await extra.locator('#blocks .cube').click();
    await extra.waitForFunction(() => window.__utterances.some((item) => item.text === 'ಒಂದು'));
    const heard = await extra.evaluate(() => ({
      speaks: window.__speaks.slice(),
      kn: window.__utterances.find((item) => item.text === 'ಒಂದು'),
      resumes: window.__resumes,
      intervals: window.__intervals.slice(),
    }));
    assert(heard.speaks.indexOf('one') === -1, 'english clip fell back to speech');
    assert(heard.kn.lang === 'kn-IN', 'kannada lang ' + heard.kn.lang);
    assert(Math.abs(heard.kn.rate - 0.85) < 0.02, 'kannada rate ' + heard.kn.rate);
    assert(heard.resumes >= 1, 'speech keepalive resume did not run');
    assert(heard.intervals.indexOf(8000) !== -1, 'speech keepalive interval missing');
    assert(errors.length === 0, 'kannada errors ' + errors.join('\n'));
  } finally {
    await extra.close();
    await browser.close();
  }
}

const pageErrors = [];
const consoleErrors = [];

const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ ...iphone });
page.on('pageerror', (err) => pageErrors.push(err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('response', (res) => {
  if (res.status() >= 400) pageErrors.push(res.status() + ' ' + res.url());
});

try {
  await arm(page);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => ({
    speaks: window.__speaks.slice(),
    plays: window.__plays.length,
    audioContexts: window.__audioContexts,
  }));
  assert(before.speaks.length === 0, 'spoke before the tap: ' + before.speaks.join(' | '));
  assert(before.plays === 0, 'audio.play before the tap');
  assert(before.audioContexts === 0, 'AudioContext before the tap');
  assert((await page.locator('#kannada').textContent()) === 'ಒಂದು', 'kannada one');
  assert(await page.locator('#blocks .cube').count() === 1, 'tower is not one');

  await page.locator('#blocks .cube').click();
  await page.waitForFunction(() => {
    const plays = window.__plays;
    if (!plays.length || plays.some((item) => item.settled === 'pending')) return false;
    const one = plays.find((item) => item.line === 'one' && !item.muted);
    const kn = plays.find((item) => item.line === 'ಒಂದು' && !item.muted);
    return one && one.during && one.settled === 'ok' && kn && kn.settled === 'ok';
  });
  const first = await page.evaluate(() => ({
    speaks: window.__speaks.slice(),
    rejected: window.__plays.filter((item) => item.settled.indexOf('err') === 0 || item.settled.indexOf('throw') === 0),
    one: window.__plays.find((item) => item.line === 'one' && !item.muted),
  }));
  assert(first.one && first.one.during && first.one.settled === 'ok', 'one play ' + JSON.stringify(first.one));
  assert(first.rejected.length === 0, 'play rejected ' + JSON.stringify(first.rejected));
  assert(first.speaks.length === 0, 'fell back to speech ' + first.speaks.join(' | '));

  await page.locator('#add-one').click();
  await page.waitForFunction(() => window.__plays.some((item) => item.line === '1 and 1 make 2' && !item.muted && item.during && item.settled === 'ok'));
  assert((await page.locator('#numeral').textContent()) === '2', 'did not grow the tower');
  assert((await page.locator('#kannada').textContent()) === 'ಎರಡು', 'kannada two');
  assert(await page.locator('#blocks .cube').count() === 2, 'tower is not two');

  await page.locator('#next').click();
  assert((await page.locator('#numeral').textContent()) === 'Together', 'together title');
  assert((await page.locator('#world-text').textContent()) === 'Tap to join. Tap to split.', 'together hint');
  await page.locator('#fact-4 .pile').first().click();
  await page.waitForFunction(() => window.__plays.some((item) => item.line === '2 and 2 make 4' && !item.muted && item.during && item.settled === 'ok'));

  const after = await page.evaluate(() => ({
    speaks: window.__speaks.slice(),
    rejected: window.__plays.filter((item) => item.settled.indexOf('err') === 0 || item.settled.indexOf('throw') === 0),
    pending: window.__plays.filter((item) => item.settled === 'pending').length,
  }));
  assert(after.rejected.length === 0, 'later play rejected ' + JSON.stringify(after.rejected));
  assert(after.pending === 0, 'plays still pending');
  assert(after.speaks.length === 0, 'later speech fallback ' + after.speaks.join(' | '));
  assert(await page.locator('audio[data-line]').count() === 20, 'voice clips were dropped');
  assert(pageErrors.length === 0, 'page errors ' + pageErrors.join('\n'));
  assert(consoleErrors.length === 0, 'console errors ' + consoleErrors.join('\n'));

  await page.evaluate(() => {
    document.querySelectorAll('audio').forEach((el) => {
      try { el.pause(); } catch (err) {}
    });
  });
  await checkCancelGap();
  await checkKannadaFallback();
  console.log('audio iphone passed');
} catch (err) {
  console.error('audio iphone failed');
  console.error(err);
  const dump = await page.evaluate(() => ({
    speaks: window.__speaks,
    plays: window.__plays,
  })).catch(() => null);
  console.error(JSON.stringify(dump, null, 2));
  console.error('page', pageErrors);
  console.error('console', consoleErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
