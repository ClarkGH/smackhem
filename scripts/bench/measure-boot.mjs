// Boot measurement for one built dist folder, from outside the game.
// Nothing is injected into the game's code: an init script observes the page.
//
// Metrics per run (ms, from navigation start):
//   ttfb, fcp, lcp (null if no LCP candidate; a WebGL canvas usually isn't one),
//   firstDraw  first WebGL drawArrays/drawElements call
//   firstFrameDone  end of the first rAF callback that issued a draw
//   tbt  sum of (longtask - 50ms) from FCP to the end of the window (Lighthouse stops at TTI; stated in the doc)
//   frameWork  p50/p95/p99 of time spent inside rAF callbacks during the window (CPU work per frame,
//              not vsync interval, which headless pins)
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { percentile } from './lib.mjs';

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm',
};

/** Static server for dist. Missing files are a plain 404 (public assets aren't in git). */
export const serveDir = (root) => new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const file = normalize(join(root, urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath));
        if (!file.startsWith(root + sep) || !existsSync(file) || statSync(file).isDirectory()) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, {
            'content-type': MIME[extname(file)] ?? 'application/octet-stream',
            // Cross-origin isolation: performance.now() resolution goes from 100µs to 5µs.
            'cross-origin-opener-policy': 'same-origin',
            'cross-origin-embedder-policy': 'require-corp',
        });
        if (req.method === 'HEAD') res.end();
        else createReadStream(file).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
});

// Runs in the page before any game script. Observes only.
const INIT_SCRIPT = () => {
    const m = { firstDraw: null, firstFrameDone: null, frames: [], longTasks: [], fcp: null, lcp: null };
    window.__bench = m;
    const wrapDraw = (proto) => {
        if (!proto) return;
        ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'].forEach((name) => {
            const orig = proto[name];
            if (!orig) return;
            proto[name] = function wrapped(...args) {
                if (m.firstDraw === null) m.firstDraw = performance.now();
                m.drewThisFrame = true;
                return orig.apply(this, args);
            };
        });
    };
    wrapDraw(window.WebGLRenderingContext?.prototype);
    wrapDraw(window.WebGL2RenderingContext?.prototype);
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((ts) => {
        m.drewThisFrame = false;
        const t0 = performance.now();
        try { cb(ts); } finally {
            const t1 = performance.now();
            if (m.firstDraw !== null) m.frames.push(t1 - t0);
            if (m.drewThisFrame && m.firstFrameDone === null) m.firstFrameDone = t1;
        }
    });
    try {
        new PerformanceObserver((l) => l.getEntries().forEach((e) => {
            if (e.name === 'first-contentful-paint') m.fcp = e.startTime;
        })).observe({ type: 'paint', buffered: true });
        new PerformanceObserver((l) => l.getEntries().forEach((e) => { m.lcp = e.startTime; }))
            .observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => l.getEntries().forEach((e) => {
            m.longTasks.push([e.startTime, e.duration]);
        })).observe({ type: 'longtask', buffered: true });
    } catch { /* observer type unsupported: metric stays null */ }
};

/**
 * One page load. `context` decides cold vs warm cache: a fresh context is cold.
 * Returns a metrics object, or { error } — never throws for an in-page failure.
 */
export const measureOnce = async (context, url, { windowMs = 1500, timeoutMs = 10_000, cpuRate = 1 } = {}) => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
    try {
        if (cpuRate > 1) {
            const cdp = await context.newCDPSession(page);
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
        }
        await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
        await page.waitForFunction(() => window.__bench?.firstFrameDone !== null, null, { timeout: timeoutMs })
            .catch(() => { /* no draw: reported below as null firstDraw */ });
        await page.waitForTimeout(windowMs);
        const raw = await page.evaluate(() => ({
            ...window.__bench,
            ttfb: performance.getEntriesByType('navigation')[0]?.responseStart ?? null,
        }));
        const tbt = raw.fcp === null ? null : raw.longTasks
            .filter(([start]) => start >= raw.fcp)
            .reduce((n, [, d]) => n + Math.max(0, d - 50), 0);
        return {
            ttfb: raw.ttfb, fcp: raw.fcp, lcp: raw.lcp, firstDraw: raw.firstDraw, firstFrameDone: raw.firstFrameDone,
            tbt,
            frames: raw.frames.length,
            frameP50: percentile(raw.frames, 50),
            frameP95: percentile(raw.frames, 95),
            frameP99: percentile(raw.frames, 99),
            pageErrors: errors.length,
            error: raw.firstDraw === null ? `no WebGL draw${errors[0] ? `: ${errors[0]}` : ''}` : null,
        };
    } catch (err) {
        return { error: String(err.message ?? err).split('\n')[0] };
    } finally {
        await page.close().catch(() => {});
    }
};

export { INIT_SCRIPT };

/**
 * Warm-ups (discarded) then measured runs for one dist.
 * mode 'cold': new context per run (empty HTTP cache). 'warm': one context, first load primes the cache.
 */
export const measureDist = async (browser, distDir, {
    runs = 20, warmups = 3, mode = 'cold', cpuRate = 1, windowMs = 1500,
} = {}) => {
    const { server, url } = await serveDir(normalize(distDir));
    const results = [];
    let shared = null;
    const newContext = async () => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await ctx.addInitScript(INIT_SCRIPT);
        return ctx;
    };
    try {
        if (mode === 'warm') {
            shared = await newContext();
            await measureOnce(shared, url, { windowMs: 200 }); // prime cache
        }
        for (let i = 0; i < warmups + runs; i += 1) {
            const ctx = mode === 'warm' ? shared : await newContext();
            const r = await measureOnce(ctx, url, { cpuRate, windowMs });
            if (mode !== 'warm') await ctx.close();
            if (i >= warmups) results.push(r);
        }
    } finally {
        if (shared) await shared.close();
        await new Promise((r) => { server.close(r); });
    }
    return results;
};
