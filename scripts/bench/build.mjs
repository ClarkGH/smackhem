// Export a commit with `git archive` and build it in one scratch folder.
// Never touches the repo's working tree or .git (no worktrees, no checkout).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** Commits oldest first: [{ idx, sha, date, subject }]. idx is 1-based position in full history. */
export const listCommits = (repo) => execFileSync(
    'git', ['-C', repo, 'log', '--reverse', '--format=%h%x09%ad%x09%s', '--date=short', 'HEAD'],
    { encoding: 'utf8', maxBuffer: 64 << 20 },
).trim().split('\n').map((line, i) => {
    const [sha, date, ...rest] = line.split('\t');
    return { idx: i + 1, sha, date, subject: rest.join('\t') };
});

const run = (workDir, cmd, args, env = {}) => {
    const t0 = process.hrtime.bigint();
    const r = spawnSync(cmd, args, {
        cwd: workDir, encoding: 'utf8', env: { ...process.env, CI: '1', ...env }, timeout: 300_000,
    });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ');
    return { ok: r.status === 0, ms, tail: r.error ? String(r.error) : tail };
};

const hashFile = (p) => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'none');

/**
 * A builder bound to one scratch folder. It keeps node_modules between commits
 * and reinstalls only when the lockfile changes.
 */
export const createBuilder = (repo, workDir) => {
    let lastLockHash = null;

    const extract = (sha) => {
        mkdirSync(workDir, { recursive: true });
        for (const name of readdirSync(workDir)) {
            if (name !== 'node_modules') rmSync(join(workDir, name), { recursive: true, force: true });
        }
        const tar = execFileSync('git', ['-C', repo, 'archive', '--format=tar', sha], { maxBuffer: 512 << 20 });
        execFileSync('tar', ['-x', '-C', workDir], { input: tar });
    };

    /**
     * Returns { status: 'pass'|'fail'|'n/a', vite, install, tsc, buildMs, distDir, error }.
     * Never throws for a build problem; it's reported in the result.
     */
    const build = (sha, { typecheck = true } = {}) => {
        const out = { status: 'fail', vite: '', install: '', tsc: '', buildMs: null, distDir: join(workDir, 'dist'), error: '' };
        try {
            extract(sha);
            if (!existsSync(join(workDir, 'package.json'))) return { ...out, status: 'n/a' };
            const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf8'));
            out.vite = pkg.devDependencies?.vite ?? pkg.dependencies?.vite ?? '';

            const lockHash = hashFile(join(workDir, 'pnpm-lock.yaml'));
            if (lockHash !== lastLockHash || !existsSync(join(workDir, 'node_modules'))) {
                rmSync(join(workDir, 'node_modules'), { recursive: true, force: true });
                let inst = run(workDir, 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline']);
                out.install = inst.ok ? 'frozen' : '';
                if (!inst.ok) {
                    // Lockfile the current pnpm won't take as-is: resolved fresh, and flagged.
                    inst = run(workDir, 'pnpm', ['install', '--no-frozen-lockfile', '--prefer-offline']);
                    out.install = inst.ok ? 'resolved' : 'fail';
                }
                if (!inst.ok) return { ...out, error: `install: ${inst.tail}` };
                lastLockHash = lockHash;
            } else {
                out.install = 'reused';
            }

            if (typecheck) out.tsc = run(workDir, 'pnpm', ['exec', 'tsc', '--noEmit']).ok ? 'pass' : 'fail';

            const b = run(workDir, 'pnpm', ['exec', 'vite', 'build', '--manifest'], { PLATFORM: 'web' });
            out.buildMs = Math.round(b.ms);
            if (!b.ok) return { ...out, error: `build: ${b.tail}` };
            return { ...out, status: 'pass' };
        } catch (err) {
            return { ...out, error: String(err.message ?? err).slice(0, 300) };
        }
    };

    return { build };
};
