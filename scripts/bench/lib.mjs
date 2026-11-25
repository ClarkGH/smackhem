// Pure helpers for the bench scripts. No git, no fs side effects beyond reads.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';

export const CODE_EXTS = new Set(['.js', '.mjs', '.css', '.html']);

/** Raw, gzip (level 9) and brotli (quality 11) byte counts for a buffer. */
export const compressedSizes = (buf) => ({
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, {
        params: { [zc.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
});

/** Every file under dir, as paths relative to dir. Missing dir → []. */
export const listFiles = (dir) => {
    if (!existsSync(dir)) return [];
    const out = [];
    const walk = (d) => {
        for (const name of readdirSync(d)) {
            const p = join(d, name);
            if (statSync(p).isDirectory()) walk(p);
            else out.push(relative(dir, p));
        }
    };
    walk(dir);
    return out.sort();
};

/** Vite 4 writes dist/manifest.json, Vite 5+ writes dist/.vite/manifest.json. */
export const readManifest = (distDir) => {
    for (const p of [join(distDir, '.vite', 'manifest.json'), join(distDir, 'manifest.json')]) {
        if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
    }
    return null;
};

/**
 * Files the browser must fetch before the entry runs: entry chunks plus their
 * static imports, transitively, plus their CSS. Dynamic imports are excluded.
 * Returns output file paths (relative to dist).
 */
export const initialFiles = (manifest) => {
    if (!manifest) return [];
    const seen = new Set();
    const files = new Set();
    const visit = (key) => {
        if (seen.has(key)) return;
        seen.add(key);
        const chunk = manifest[key];
        if (!chunk) return; // dangling reference: ignore rather than crash
        if (chunk.file) files.add(chunk.file);
        for (const css of chunk.css ?? []) files.add(css);
        for (const imp of chunk.imports ?? []) visit(imp);
    };
    for (const [key, chunk] of Object.entries(manifest)) {
        if (chunk.isEntry) visit(key);
    }
    return [...files].sort();
};

const sum = (rows, field) => rows.reduce((n, r) => n + r[field], 0);

/** Size summary of a built dist folder. Code files only; public assets are reported as one total. */
export const measureDist = (distDir) => {
    const all = listFiles(distDir).filter((f) => !f.startsWith('.vite') && f !== 'manifest.json');
    const code = all.filter((f) => CODE_EXTS.has(extname(f)));
    const rows = code.map((f) => ({ file: f, ...compressedSizes(readFileSync(join(distDir, f))) }));
    const js = rows.filter((r) => /\.m?js$/.test(r.file));
    const initialSet = new Set(initialFiles(readManifest(distDir)));
    const initial = rows.filter((r) => initialSet.has(r.file));
    const assetBytes = all
        .filter((f) => !CODE_EXTS.has(extname(f)))
        .reduce((n, f) => n + statSync(join(distDir, f)).size, 0);
    return {
        jsFiles: js.length,
        jsRaw: sum(js, 'raw'),
        jsGzip: sum(js, 'gzip'),
        jsBrotli: sum(js, 'brotli'),
        codeRaw: sum(rows, 'raw'),
        codeGzip: sum(rows, 'gzip'),
        codeBrotli: sum(rows, 'brotli'),
        initialRaw: sum(initial, 'raw'),
        initialGzip: sum(initial, 'gzip'),
        initialBrotli: sum(initial, 'brotli'),
        assetBytes,
    };
};

/** Quote a value for CSV. */
export const csvCell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export const toCsv = (columns, rows) => [
    columns.join(','),
    ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')),
].join('\n') + '\n';

/** n, min, median, p75, p95, max, IQR of finite values; nulls and NaN dropped. Empty → n: 0, rest null. */
export const summarize = (values) => {
    const v = values.filter((x) => Number.isFinite(x));
    const p = (q) => percentile(v, q);
    const iqr = v.length ? p(75) - p(25) : null;
    return { n: v.length, min: p(0), median: p(50), p75: p(75), p95: p(95), max: p(100), iqr };
};

/**
 * Two-sided Mann-Whitney U test, normal approximation with tie correction.
 * Distribution-free, so it suits skewed timing data. Fine for n >= ~8 per side.
 * Returns { u, z, p } or null when either side is empty or all values are tied.
 */
export const mannWhitney = (a, b) => {
    const n1 = a.length;
    const n2 = b.length;
    if (!n1 || !n2) return null;
    const all = [...a.map((x) => [x, 0]), ...b.map((x) => [x, 1])].sort((x, y) => x[0] - y[0]);
    const ranks = new Array(all.length);
    let tieTerm = 0;
    let i = 0;
    while (i < all.length) {
        let j = i;
        while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j += 1;
        const avg = (i + j) / 2 + 1;
        for (let k = i; k <= j; k += 1) ranks[k] = avg;
        const t = j - i + 1;
        tieTerm += t ** 3 - t;
        i = j + 1;
    }
    let r1 = 0;
    for (let k = 0; k < all.length; k += 1) if (all[k][1] === 0) r1 += ranks[k];
    const u1 = r1 - (n1 * (n1 + 1)) / 2;
    const n = n1 + n2;
    const variance = ((n1 * n2) / 12) * ((n + 1) - tieTerm / (n * (n - 1)));
    if (variance <= 0) return null;
    const z = (u1 - (n1 * n2) / 2) / Math.sqrt(variance);
    return { u: Math.min(u1, n1 * n2 - u1), z, p: 2 * (1 - normalCdf(Math.abs(z))) };
};

/** Standard normal CDF (Abramowitz-Stegun 26.2.17, error < 7.5e-8). */
export const normalCdf = (x) => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804014327 * Math.exp(-x * x / 2);
    const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - tail : tail;
};

/** Nearest-rank percentile on a copy; empty → null. p in [0, 100]. */
export const percentile = (values, p) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.ceil((p / 100) * sorted.length);
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
};
