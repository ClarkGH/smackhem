import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    compressedSizes, initialFiles, measureDist, csvCell, toCsv, percentile, listFiles,
} from './lib.mjs';

test('compressedSizes: empty buffer', () => {
    const s = compressedSizes(Buffer.alloc(0));
    assert.equal(s.raw, 0);
    assert.ok(s.gzip > 0); // gzip has a header even for empty input
});

test('compressedSizes: repetitive input compresses', () => {
    const s = compressedSizes(Buffer.from('a'.repeat(10000)));
    assert.equal(s.raw, 10000);
    assert.ok(s.gzip < 100 && s.brotli < 100);
});

test('initialFiles: null manifest', () => assert.deepEqual(initialFiles(null), []));

test('initialFiles: follows static imports, skips dynamic, handles cycles and dangling refs', () => {
    const m = {
        'index.html': { file: 'assets/index.js', isEntry: true, imports: ['_shared'], dynamicImports: ['lazy'], css: ['assets/a.css'] },
        _shared: { file: 'assets/shared.js', imports: ['index.html', '_missing'] },
        lazy: { file: 'assets/lazy.js', isDynamicEntry: true },
    };
    assert.deepEqual(initialFiles(m), ['assets/a.css', 'assets/index.js', 'assets/shared.js']);
});

test('listFiles: missing dir', () => assert.deepEqual(listFiles('/nonexistent/xyz'), []));

test('measureDist: code vs assets, manifest excluded', () => {
    const d = mkdtempSync(join(tmpdir(), 'bench-'));
    try {
        mkdirSync(join(d, 'assets'));
        mkdirSync(join(d, '.vite'));
        writeFileSync(join(d, 'index.html'), '<html></html>');
        writeFileSync(join(d, 'assets/index.js'), 'console.log(1)');
        writeFileSync(join(d, 'assets/lazy.js'), 'export default 2');
        writeFileSync(join(d, 'assets/s.ogg'), Buffer.alloc(500));
        writeFileSync(join(d, '.vite/manifest.json'), JSON.stringify({
            'index.html': { file: 'assets/index.js', isEntry: true, dynamicImports: ['l'] },
            l: { file: 'assets/lazy.js' },
        }));
        const m = measureDist(d);
        assert.equal(m.jsFiles, 2);
        assert.equal(m.jsRaw, 14 + 16);
        assert.equal(m.initialRaw, 14);
        assert.equal(m.assetBytes, 500);
    } finally {
        rmSync(d, { recursive: true, force: true });
    }
});

test('csvCell: quoting', () => {
    assert.equal(csvCell(null), '');
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(toCsv(['a'], [{ a: 1 }]), 'a\n1\n');
});

test('percentile: nearest rank', () => {
    assert.equal(percentile([], 50), null);
    assert.equal(percentile([5], 95), 5);
    assert.equal(percentile([1, 2, 3, 4], 50), 2);
    assert.equal(percentile([4, 1, 3, 2], 100), 4);
    assert.equal(percentile([1, 2, 3, 4], 0), 1);
});

import { summarize, mannWhitney, normalCdf } from './lib.mjs';

test('summarize: drops non-finite, empty', () => {
    assert.deepEqual(summarize([]), { n: 0, min: null, median: null, p75: null, p95: null, max: null, iqr: null });
    const s = summarize([3, null, NaN, 1, 2, Infinity]);
    assert.equal(s.n, 3);
    assert.equal(s.median, 2);
});

test('normalCdf: known points', () => {
    assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
    assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
    assert.ok(Math.abs(normalCdf(-1.96) - 0.025) < 1e-4);
});

test('mannWhitney: empty side and all ties → null', () => {
    assert.equal(mannWhitney([], [1]), null);
    assert.equal(mannWhitney([5, 5, 5], [5, 5, 5]), null);
});

test('mannWhitney: clearly separated samples are significant, same samples are not', () => {
    const a = Array.from({ length: 20 }, (_, i) => 100 + i);
    const b = Array.from({ length: 20 }, (_, i) => 140 + i);
    const r = mannWhitney(a, b);
    assert.equal(r.u, 0);
    assert.ok(r.p < 0.001);
    assert.ok(mannWhitney(a, [...a]).p > 0.9);
});

test('mannWhitney: symmetric in argument order', () => {
    const a = [1, 4, 6, 9, 12, 13];
    const b = [2, 3, 5, 7, 8, 10, 11];
    assert.ok(Math.abs(mannWhitney(a, b).p - mannWhitney(b, a).p) < 1e-12);
});

import {
    parseCsv, newCommits, referenceRange, checkReference, envDiff, renderLatest,
} from './lib.mjs';

test('parseCsv: empty, header only, no trailing newline, CRLF', () => {
    assert.deepEqual(parseCsv(''), []);
    assert.deepEqual(parseCsv('a,b\n'), []);
    assert.deepEqual(parseCsv('a,b\n1,2'), [{ a: '1', b: '2' }]);
    assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [{ a: '1', b: '2' }]);
});

test('parseCsv: reads back what toCsv writes, quotes and all', () => {
    const rows = [{ sha: 'abc', subject: 'Fix "x", then y' }, { sha: 'def', subject: 'line\nbreak' }, { sha: 'ghi', subject: '' }];
    assert.deepEqual(parseCsv(toCsv(['sha', 'subject'], rows)), rows);
});

test('parseCsv: a short row fills missing cells with empty strings', () => {
    assert.deepEqual(parseCsv('a,b,c\n1\n'), [{ a: '1', b: '', c: '' }]);
});

test('newCommits: keeps order, drops measured, handles none and all', () => {
    const commits = [{ sha: 'a' }, { sha: 'b' }, { sha: 'c' }];
    assert.deepEqual(newCommits(commits, new Set(['b'])), [{ sha: 'a' }, { sha: 'c' }]);
    assert.deepEqual(newCommits(commits, new Set(['a', 'b', 'c'])), []);
    assert.deepEqual(newCommits([], new Set()), []);
});

test('referenceRange: only the reference\'s control rows count; none → null', () => {
    const rows = [
        { role: 'control', sha: 'ref', firstDraw_median: '112.5' },
        { role: 'control', sha: 'ref', firstDraw_median: '119' },
        { role: 'commit', sha: 'ref', firstDraw_median: '200' }, // a commit row, not a control
        { role: 'control', sha: 'other', firstDraw_median: '50' },
        { role: 'control', sha: 'ref', firstDraw_median: '' }, // a failed control
    ];
    assert.deepEqual(referenceRange(rows, 'ref'), { min: 112.5, max: 119, n: 2 });
    assert.equal(referenceRange(rows, 'missing'), null);
    assert.equal(referenceRange([], 'ref'), null);
});

test('checkReference: inside, on the edge, outside either side, no range', () => {
    const range = { min: 112, max: 119, n: 14 };
    assert.deepEqual(checkReference(115, range), { comparable: true, median: 115, range, outsideBy: 0 });
    assert.equal(checkReference(119, range).comparable, true);
    assert.equal(checkReference(125, range).outsideBy, 6);
    assert.equal(checkReference(110, range).outsideBy, 2);
    assert.equal(checkReference(125, range).comparable, false);
    assert.equal(checkReference(115, null).comparable, false);
    assert.equal(checkReference(NaN, range).comparable, false);
});

test('envDiff: same is empty; stop fields differ; os alone does not stop', () => {
    const base = { cpu: 'R7', cores: 16, node: 'v26', chromium: '159', playwright: '1.65.1', launchArgs: ['--a'], os: 'k42' };
    assert.deepEqual(envDiff(base, { ...base }), []);
    assert.deepEqual(envDiff(base, { ...base, os: 'k43' }), []);
    assert.deepEqual(envDiff(base, { ...base, chromium: '160', launchArgs: ['--b'] }), ['chromium', 'launchArgs']);
    assert.deepEqual(envDiff(base, {}).length, 6);
});

test('renderLatest: comparable, not comparable, nothing new; pipes in subjects are escaped', () => {
    const range = { min: 112, max: 119, n: 14 };
    const row = { sha: 'f22d633', date: '2026-11-27', subject: 'a | b', jsBrotli: '43520', initialBrotli: '19900', firstDraw_median: '118.2', firstDraw_iqr: '6.1' };
    const ok = renderLatest({ era: '2026-11-24', generatedAt: 'now', referenceSha: 'ref', check: checkReference(115, range), rows: [row] });
    assert.match(ok, /^Comparable/m);
    assert.match(ok, /a \\\| b/);
    assert.match(ok, /118\.2 ms/);
    assert.match(ok, /43\.5 KB/); // 1000 bytes to the KB, like docs/performance.md
    const bad = renderLatest({ era: 'e', generatedAt: 'now', referenceSha: 'ref', check: checkReference(130, range), rows: [] });
    assert.match(bad, /\*\*Not comparable:\*\*.*11\.0 ms outside/);
    assert.match(bad, /No new commits/);
    const none = renderLatest({ era: 'e', generatedAt: 'now', referenceSha: 'ref', check: checkReference(115, null), rows: [] });
    assert.match(none, /has no saved range/);
});
