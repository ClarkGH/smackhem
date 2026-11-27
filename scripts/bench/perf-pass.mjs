// Perf pass: build each selected commit, serve its dist (code only, no public assets),
// and measure boot in headless Chromium. One commit at a time. Run on an idle machine.
//
// usage: node perf-pass.mjs <repo> <workDir> <outDir> [options]
//   --only sha,sha       only these commits (default: every commit that builds)
//   --every N            every Nth commit, plus HEAD
//   --profile quick|full quick: cold, 1x CPU. full: cold+warm × 1x+4x CPU
//   --runs N             measured runs per config (default 20)
//   --warmups N          discarded runs per config (default 3)
//   --control-every N    re-measure the control build (HEAD) every N commits (default 25, 0 = off).
//                        Same bytes every time, so drift in the control means the machine changed.
//   --reference SHA      use this commit as the control instead of HEAD. Its build is saved once in
//                        results/reference/SHA and reused; it's measured at the start and end, as role "reference"
//                        (not "control", so weekly checks never widen the baseline's range)
//   --append             add to the CSVs in outDir instead of replacing them. Stops if their header doesn't match.
//                        Leaves env.json (the baseline) alone and writes this sitting's to env-latest.json
//   --env-check FILE     stop (exit 3) before measuring if this machine differs from FILE in a stop field
import { chromium } from 'playwright';
import {
    writeFileSync, appendFileSync, mkdirSync, readFileSync, cpSync, rmSync, existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import os from 'node:os';
import { createBuilder, listCommits } from './build.mjs';
import { measureDist } from './measure-boot.mjs';
import {
    summarize, toCsv, csvCell, envDiff,
} from './lib.mjs';

// Pinned, not Chromium's default, so a Chromium update can't quietly change the GL path under the numbers.
// The default path also looked slower and noisier in a quick check on 2026-11-24, but that wasn't a clean
// A/B: see results/quick-default-flags (a busy machine, no control).
export const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const args = process.argv.slice(2);
const [repo, workDir, outDir] = args;
const opt = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i > 0 ? args[i + 1] : dflt;
};
if (!repo || !workDir || !outDir) {
    console.error('usage: node perf-pass.mjs <repo> <workDir> <outDir> [--only a,b] [--every N] [--profile quick|full] [--runs N] [--warmups N] [--control-every N] [--reference SHA] [--append] [--env-check FILE]');
    process.exit(2);
}
const runs = Number(opt('runs', 20));
const warmups = Number(opt('warmups', 3));
const profile = opt('profile', 'quick');
const only = opt('only', null);
const every = Number(opt('every', 1));
const controlEvery = Number(opt('control-every', 25));
const referenceSha = opt('reference', null);
const append = args.includes('--append');
const envCheckFile = opt('env-check', null);
if (!['quick', 'full'].includes(profile) || !(runs > 0) || !(warmups >= 0) || !(every >= 1) || !(controlEvery >= 0)) {
    console.error('bad options');
    process.exit(2);
}

const CONFIGS = profile === 'full'
    ? [{ mode: 'cold', cpuRate: 1 }, { mode: 'warm', cpuRate: 1 }, { mode: 'cold', cpuRate: 4 }, { mode: 'warm', cpuRate: 4 }]
    : [{ mode: 'cold', cpuRate: 1 }];
const METRICS = ['ttfb', 'fcp', 'firstDraw', 'firstFrameDone', 'tbt', 'frameP50', 'frameP95', 'frameP99'];

const all = listCommits(repo);
const head = all[all.length - 1];
let commits = all;
if (only !== null) {
    // An empty --only means no commits (just the reference), never "all of them"
    const set = new Set(only.split(','));
    commits = all.filter((c) => set.has(c.sha));
} else if (every > 1) {
    commits = all.filter((c, i) => i % every === 0 || i === all.length - 1);
}

mkdirSync(outDir, { recursive: true });

// Control: HEAD, built once into its own folder so its bytes never change during the pass.
// With --reference, a fixed commit instead, built once and kept between runs.
const controlCommit = referenceSha ? all.find((c) => c.sha === referenceSha) : head;
if (!controlCommit) {
    console.error(`reference ${referenceSha} isn't in this repo's history`);
    process.exit(2);
}
const controlRole = referenceSha ? 'reference' : 'control';
let controlDist = null;
if (referenceSha || controlEvery > 0) {
    controlDist = referenceSha
        ? join(dirname(outDir), 'reference', referenceSha)
        : join(outDir, '.control-dist');
    if (!referenceSha || !existsSync(controlDist)) {
        const cb = createBuilder(repo, `${workDir}-control`).build(controlCommit.sha, { typecheck: false });
        if (cb.status !== 'pass') {
            console.error(`control build failed: ${cb.error}`);
            process.exit(1);
        }
        rmSync(controlDist, { recursive: true, force: true });
        cpSync(cb.distDir, controlDist, { recursive: true });
    }
}

const browser = await chromium.launch({ args: LAUNCH_ARGS });
const env = {
    startedAt: new Date().toISOString(),
    cpu: os.cpus()[0]?.model, cores: os.cpus().length, memGB: Math.round(os.totalmem() / 2 ** 30),
    os: `${os.type()} ${os.release()}`, node: process.version, chromium: browser.version(),
    // Read from disk: the package's exports map may not expose package.json to import().
    playwright: JSON.parse(readFileSync(new URL('./node_modules/playwright/package.json', import.meta.url), 'utf8')).version,
    launchArgs: LAUNCH_ARGS,
    gl: 'SwiftShader via ANGLE (software WebGL; headless has no GPU)',
    profile, runs, warmups, every, only,
    control: controlDist ? { sha: controlCommit.sha, every: controlEvery, role: controlRole } : null,
    assets: 'none: public/ is gitignored, so dist is code only (an empty world from commit 133 on)',
};

if (envCheckFile) {
    const changed = envDiff(JSON.parse(readFileSync(envCheckFile, 'utf8')), env);
    if (changed.length) {
        console.error(`environment changed since ${envCheckFile}: ${changed.join(', ')}. Not comparable; start a new era (docs/performance.md).`);
        await browser.close();
        process.exit(3);
    }
}
writeFileSync(join(outDir, append ? 'env-latest.json' : 'env.json'), `${JSON.stringify(env, null, 2)}\n`);

const RUN_COLS = ['role', 'idx', 'sha', 'mode', 'cpuRate', 'run', ...METRICS, 'frames', 'pageErrors', 'error'];
const SUM_COLS = ['role', 'idx', 'sha', 'date', 'subject', 'build', 'mode', 'cpuRate', 'n', 'failed',
    ...METRICS.flatMap((m) => [`${m}_median`, `${m}_p95`, `${m}_iqr`]), 'error'];
const runsCsv = join(outDir, 'perf-runs.csv');
const sumCsv = join(outDir, 'perf-summary.csv');

// Appending to a CSV with other columns would misalign every new row, so that's a hard stop.
const startCsv = (file, cols) => {
    if (!append) {
        writeFileSync(file, toCsv(cols, []));
        return;
    }
    const header = existsSync(file) ? readFileSync(file, 'utf8').split('\n', 1)[0] : '';
    if (header !== cols.join(',')) {
        console.error(`can't append to ${file}: its header doesn't match this script's columns`);
        process.exit(2);
    }
};
startCsv(runsCsv, RUN_COLS);
startCsv(sumCsv, SUM_COLS);
const line = (cols, row) => `${cols.map((k) => csvCell(row[k])).join(',')}\n`;

/** Measure one dist under every config and append runs + summaries. */
const measureAndRecord = async (role, c, distDir, label) => {
    for (const cfg of CONFIGS) {
        const results = await measureDist(browser, distDir, { ...cfg, runs, warmups });
        results.forEach((r, i) => appendFileSync(runsCsv, line(RUN_COLS, { role, ...c, ...cfg, run: i + 1, ...r })));
        const ok = results.filter((r) => !r.error);
        const row = { role, ...c, build: 'pass', ...cfg, n: ok.length, failed: results.length - ok.length,
            error: results.find((r) => r.error)?.error ?? '' };
        METRICS.forEach((m) => {
            const s = summarize(ok.map((r) => r[m]));
            row[`${m}_median`] = s.median?.toFixed(2);
            row[`${m}_p95`] = s.p95?.toFixed(2);
            row[`${m}_iqr`] = s.iqr?.toFixed(2);
        });
        appendFileSync(sumCsv, line(SUM_COLS, row));
        console.log(`${label} ${role} ${c.sha} ${cfg.mode} ${cfg.cpuRate}x firstDraw=${row.firstDraw_median}ms n=${ok.length}`);
    }
};

const builder = createBuilder(repo, workDir);
console.log(`perf pass: ${commits.length} commits × ${CONFIGS.length} configs × ${runs} runs, control every ${controlEvery || 'off'}`);

try {
    if (controlDist) await measureAndRecord(controlRole, controlCommit, controlDist, '[start]');
    for (let ci = 0; ci < commits.length; ci += 1) {
        const c = commits[ci];
        const label = `[${ci + 1}/${commits.length}]`;
        const b = builder.build(c.sha, { typecheck: false });
        if (b.status !== 'pass') {
            if (b.status !== 'n/a') appendFileSync(sumCsv, line(SUM_COLS, { role: 'commit', ...c, build: b.status, error: b.error }));
            console.log(`${label} ${c.sha} ${b.status}`);
            continue;
        }
        await measureAndRecord('commit', c, b.distDir, label);
        if (controlDist && controlEvery > 0 && (ci + 1) % controlEvery === 0) {
            await measureAndRecord(controlRole, controlCommit, controlDist, label);
        }
    }
    if (controlDist) await measureAndRecord(controlRole, controlCommit, controlDist, '[end]');
} finally {
    await browser.close();
}
console.log(`done → ${outDir}`);
