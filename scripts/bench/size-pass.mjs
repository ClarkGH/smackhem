// Size pass: build every commit and measure its dist (code only). Sequential.
//
// usage: node size-pass.mjs <repo> <workDir> <outCsv> [--limit N] [--only sha,sha] [--append]
//   --append  add to outCsv instead of replacing it. Stops if its header doesn't match.
import {
    appendFileSync, writeFileSync, existsSync, readFileSync,
} from 'node:fs';
import { createBuilder, listCommits } from './build.mjs';
import { measureDist, toCsv, csvCell } from './lib.mjs';

const args = process.argv.slice(2);
const [repo, workDir, outCsv] = args;
const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i > 0 ? args[i + 1] : null;
};
if (!repo || !workDir || !outCsv) {
    console.error('usage: node size-pass.mjs <repo> <workDir> <outCsv> [--limit N] [--only sha,sha] [--append]');
    process.exit(2);
}
const limit = opt('limit') ? Number(opt('limit')) : Infinity;
const only = opt('only') ? new Set(opt('only').split(',')) : null;

const COLUMNS = [
    'idx', 'sha', 'date', 'subject', 'vite', 'install', 'tsc', 'build', 'buildMs',
    'jsFiles', 'jsRaw', 'jsGzip', 'jsBrotli', 'initialRaw', 'initialGzip', 'initialBrotli',
    'codeRaw', 'codeGzip', 'codeBrotli', 'error',
];

const commits = listCommits(repo).filter((c) => !only || only.has(c.sha)).slice(0, limit);
const builder = createBuilder(repo, workDir);
if (!args.includes('--append')) {
    writeFileSync(outCsv, toCsv(COLUMNS, []));
} else if (!existsSync(outCsv) || readFileSync(outCsv, 'utf8').split('\n', 1)[0] !== COLUMNS.join(',')) {
    // Appending to a CSV with other columns would misalign every new row
    console.error(`can't append to ${outCsv}: missing, or its header doesn't match this script's columns`);
    process.exit(2);
}
console.log(`size pass: ${commits.length} commits`);

commits.forEach((c, i) => {
    const b = builder.build(c.sha); // typechecks too; recorded separately so a type error doesn't hide the size
    const row = { ...c, ...b, build: b.status };
    if (b.status === 'pass') {
        try {
            Object.assign(row, measureDist(b.distDir));
        } catch (err) {
            row.error = `measure: ${String(err.message ?? err).slice(0, 200)}`;
        }
    }
    appendFileSync(outCsv, `${COLUMNS.map((k) => csvCell(row[k])).join(',')}\n`);
    console.log(`[${i + 1}/${commits.length}] ${c.sha} ${row.build} js(br)=${row.jsBrotli ?? '-'} ${row.error}`);
});
console.log(`done → ${outCsv}`);
