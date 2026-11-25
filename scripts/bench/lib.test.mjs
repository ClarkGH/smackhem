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
