// pnpm bench: measure the commits the CSVs don't have yet, append them, recheck the reference, write latest.md.
// Run by hand on an idle machine. Never edits docs or commits anything.
//
// Exit codes: 0 done (comparable or not, see latest.md), 3 the environment changed (nothing measured), 1 a pass failed.
import { spawnSync } from 'node:child_process';
import {
    readFileSync, writeFileSync, appendFileSync, existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { listCommits } from './build.mjs';
import {
    parseCsv, newCommits, referenceRange, checkReference, renderLatest, toCsv, csvCell,
} from './lib.mjs';

// The ruler: every run measures this build and compares it with its overnight range (docs/performance.md)
const REFERENCE = 'b58937d';

const BENCH = dirname(fileURLToPath(import.meta.url));
const REPO = join(BENCH, '..', '..');
// --results DIR points at a copy, for trying it out without touching the real data
const resultsArg = process.argv.indexOf('--results');
const RESULTS = resultsArg > 0 ? process.argv[resultsArg + 1] : join(BENCH, 'results');
const QUICK = join(RESULTS, 'quick');
const SIZE_CSV = join(RESULTS, 'size.csv');
const SUMMARY_CSV = join(QUICK, 'perf-summary.csv');
const CHECKS_CSV = join(QUICK, 'checks.csv');
const LATEST_MD = join(RESULTS, 'latest.md');
const WORK = join(tmpdir(), 'smackhem-bench');
const CHECK_COLS = ['date', 'referenceSha', 'referenceMedians', 'comparable', 'outsideBy', 'commits'];

const read = (file) => (existsSync(file) ? parseCsv(readFileSync(file, 'utf8')) : []);
const run = (script, args) => spawnSync(process.execPath, [join(BENCH, script), ...args], { stdio: 'inherit' }).status;

const baseline = JSON.parse(readFileSync(join(QUICK, 'env.json'), 'utf8'));
const era = baseline.startedAt.slice(0, 10);
const generatedAt = new Date().toISOString();
const commits = listCommits(REPO);
const sizeRows = read(SIZE_CSV);
const summaryBefore = read(SUMMARY_CSV);

// A commit the size pass couldn't build (docs only, or broken) has no perf row, but it's known: don't retry it
const sizeKnown = new Set(sizeRows.map((r) => r.sha));
const perfKnown = new Set(summaryBefore.filter((r) => r.role === 'commit').map((r) => r.sha));
sizeRows.forEach((r) => { if (r.build !== 'pass') perfKnown.add(r.sha); });
const sizeNew = newCommits(commits, sizeKnown);
const perfNew = newCommits(commits, perfKnown);
console.log(`bench: ${sizeNew.length} new for size, ${perfNew.length} new for perf, reference ${REFERENCE}`);

if (sizeNew.length && run('size-pass.mjs', [REPO, `${WORK}-size`, SIZE_CSV, '--append', '--only', sizeNew.map((c) => c.sha).join(',')]) !== 0) {
    console.error('size pass failed');
    process.exit(1);
}

// The reference is measured at the start and end even when nothing is new: a check on the ruler itself
const perfStatus = run('perf-pass.mjs', [
    REPO, `${WORK}-perf`, QUICK, '--append', '--reference', REFERENCE, '--control-every', '0',
    '--env-check', join(QUICK, 'env.json'), '--only', perfNew.map((c) => c.sha).join(','),
]);
if (perfStatus === 3) {
    writeFileSync(LATEST_MD, `# Latest benchmark\n\nStopped ${generatedAt}: the machine's environment changed since the ${era} baseline (details in the run log). Nothing was measured. A new era starts with an overnight rerun of the history; see [docs/performance.md](../../../docs/performance.md).\n`);
    process.exit(3);
}
if (perfStatus !== 0) {
    console.error('perf pass failed');
    process.exit(1);
}

// This sitting's reference rows are the ones appended after the run started
const summaryAfter = read(SUMMARY_CSV);
const appended = summaryAfter.slice(summaryBefore.length);
const range = referenceRange(summaryAfter, REFERENCE);
const checks = appended
    .filter((r) => r.role === 'reference' && r.sha === REFERENCE)
    .map((r) => checkReference(Number(r.firstDraw_median), range));
// Comparable only if every reference measurement in the sitting is inside the range; report the one furthest out
const worst = checks.length
    ? checks.reduce((a, b) => (b.outsideBy > a.outsideBy ? b : a))
    : checkReference(NaN, range);
const comparable = checks.length > 0 && checks.every((c) => c.comparable);
const check = { ...worst, comparable };

if (!existsSync(CHECKS_CSV)) writeFileSync(CHECKS_CSV, toCsv(CHECK_COLS, []));
appendFileSync(CHECKS_CSV, `${CHECK_COLS.map((k) => csvCell({
    date: generatedAt,
    referenceSha: REFERENCE,
    referenceMedians: checks.map((c) => c.median).join(';'),
    comparable,
    outsideBy: worst.outsideBy === null ? '' : worst.outsideBy.toFixed(2),
    commits: perfNew.map((c) => c.sha).join(';'),
}[k])).join(',')}\n`);

const latestEnv = JSON.parse(readFileSync(join(QUICK, 'env-latest.json'), 'utf8'));
const osNote = latestEnv.os !== baseline.os
    ? `The OS changed from ${baseline.os} to ${latestEnv.os} since the baseline. That doesn't stop a run; the reference check above shows whether it moved the numbers.`
    : '';
const sizeBySha = new Map(read(SIZE_CSV).map((r) => [r.sha, r]));
const rows = appended.filter((r) => r.role === 'commit').map((r) => ({
    sha: r.sha,
    date: r.date,
    subject: r.subject,
    jsBrotli: sizeBySha.get(r.sha)?.jsBrotli,
    initialBrotli: sizeBySha.get(r.sha)?.initialBrotli,
    firstDraw_median: r.firstDraw_median,
    firstDraw_iqr: r.firstDraw_iqr,
}));
writeFileSync(LATEST_MD, renderLatest({
    era, generatedAt, referenceSha: REFERENCE, check, rows, osNote,
}));
console.log(`bench: ${comparable ? 'comparable' : 'NOT comparable'}, ${rows.length} commit(s) added → ${LATEST_MD}`);
