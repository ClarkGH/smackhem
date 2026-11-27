# Performance

How big Smackhem's code is and how fast it boots, measured on every commit in the project's history. The scripts and raw data are in the repo, so anyone can check the numbers or rerun them.

## Table of Contents

- [Summary](#summary)
- [What's measured, and why](#whats-measured-and-why)
- [Method](#method)
- [Results](#results)
- [Findings](#findings)
- [Limits](#limits)
- [Reproduce it](#reproduce-it)
- [Navigation](#navigation)

## Summary

Measured 2026-11-24, through commit `b58937d`:

- **Size:** 42.4 KB of JavaScript (brotli), of which 19.4 KB loads at startup. 294 of 300 commits built; the other 6 came before there was anything to build.
- **Boot:** the first WebGL draw happens about **119 ms** after navigation starts (median of 20 cold loads, software WebGL, an empty world). The last 30 commits all fall between 109 and 121 ms.
- **Per frame:** about 0.4 ms of CPU work in a typical frame, 0.75 ms at the 95th percentile. No long tasks, so total blocking time is 0.

These are numbers to compare commits with, not a promise of what a player sees. See [Limits](#limits).

## What's measured, and why

Boot time used to be a number read by eye off Vite's dev server ("ready in …"). That measures the dev server, not the game, and it changed every time it was quoted. These numbers replace it: measured the same way on every commit, from production builds, with the method written down.

**Size** (from `vite build`, compressed the way a server would send it):

| Column | Meaning |
| --- | --- |
| `jsBrotli`, `jsGzip`, `jsRaw` | All JavaScript in the build |
| `initialBrotli`, … | Only what the page loads at startup (from Vite's manifest), not what's loaded later |

**Boot** (milliseconds from the start of navigation):

| Metric | Meaning |
| --- | --- |
| `firstDraw` | The first WebGL draw call. The headline number: the game has started drawing |
| `firstFrameDone` | The end of the first animation frame that drew |
| `fcp` | First Contentful Paint, the browser's own "something is on screen" |
| `ttfb` | Time to first byte. About 1 ms, since the server is local; shown so it can be ruled out |
| `tbt` | Total blocking time: long tasks beyond 50 ms, from FCP to the end of the window |
| `frameP50/P95/P99` | CPU time spent inside each animation frame callback, over 1.5 s after the first draw. Headless Chromium pins the frame rate, so this is work per frame, not frame rate |

## Method

The scripts are in [`scripts/bench/`](../scripts/bench/).

- **Every commit, one at a time.** Each commit is exported with `git archive` into a scratch folder outside the repo, installed with its own lockfile, and built with `vite build` (`PLATFORM=web`). The repo's working tree is never touched.
- **Typecheck is recorded, not required.** Vite doesn't typecheck, so a commit with type errors can still build. 10 commits failed `tsc` and are marked in `size.csv`.
- **Served locally,** from a small static server, at 1280×720. The server sends cross-origin isolation headers, which make `performance.now()` precise to about 5 µs instead of 100 µs.
- **Cold loads:** a new browser context for every load, so nothing is cached. 3 warm-up loads are thrown away, then 20 are measured. The summary is the median, the 95th percentile and the interquartile range of those 20.
- **Measured from inside the page.** A script that runs before the game wraps WebGL's draw calls and `requestAnimationFrame` to timestamp them. It only observes.
- **Pinned software WebGL** (`--use-angle=swiftshader`). Headless Chromium has no GPU. Pinning the GL path keeps a Chromium update from quietly changing the numbers.
- **A control, to catch the machine drifting.** Every 25 commits the run reloads the same build (HEAD at the start of the run). Its bytes never change, so if its numbers move, the machine changed, not the code. Across the night of 2026-11-24 its first draw stayed between 112 and 119 ms (14 checks).

The environment of each run (CPU, OS, Node, Chromium, Playwright, flags) is saved next to its results in `env.json`.

## Results

Raw data:

- [`size.csv`](../scripts/bench/results/size.csv): one row per commit.
- [`quick/perf-summary.csv`](../scripts/bench/results/quick/perf-summary.csv): one row per commit (and per control check), with median, p95 and IQR per metric.
- [`quick/perf-runs.csv`](../scripts/bench/results/quick/perf-runs.csv): every measured load (6,160 rows).
- [`quick/env.json`](../scripts/bench/results/quick/env.json): the machine and settings.

`quick-default-flags/` is an earlier run from the same day, before the WebGL flags were pinned. The machine was busy during it and it had no control, so none of the numbers here come from it. It's kept so nothing is hidden.

### Boot, by stage of the project

| Commits | Stage | First draw (median of the stage) | JS, brotli |
| --- | --- | --- | --- |
| 16–73 | Wireframe world, before 0.3.0 | 34 ms | 1.6 → 4.0 KB |
| 74–127 | 0.3.0 lighting, before asset loading | 76 ms | 6.1 → 10.3 KB |
| 128–132 | Chunk data loaded before the first draw, still tracked in git | 165 ms | 11.3 KB |
| 133–300 | `public/` untracked: the world loads empty (see [Limits](#limits)) | 108 ms (99–145) | 11.3 → 42.4 KB |

Commits 7–15 have no boot numbers: they build, but nothing draws with WebGL yet.

### HEAD (`b58937d`)

| Metric | Median | p95 | IQR |
| --- | --- | --- | --- |
| `firstDraw` | 118.7 ms | 127.4 ms | 8.2 ms |
| `firstFrameDone` | 121.3 ms | 130.6 ms | 8.9 ms |
| `fcp` | 192.1 ms | 205.8 ms | 14.1 ms |
| `tbt` | 0 ms | 0 ms | 0 ms |
| Frame work, p50 / p95 / p99 | 0.37 / 0.75 / 1.30 ms | | |

Size at HEAD: 42.4 KB brotli (48.9 KB gzip, 159.6 KB raw) in 2 files; 19.4 KB brotli at startup.

## Findings

- **The biggest boot change was asset loading, not code size.** Commit `4d90c53` (2026-01-18) started loading chunk data before the world draws, and first draw went from 76 ms to 169 ms in one commit. The code grew by 1 KB.
- **Since then, boot has held steady while the code quadrupled.** From commit 133 to HEAD, JavaScript grew from 11.3 to 42.4 KB, while first draw stayed around 100–120 ms. The largest single additions were the lose condition and game over (+6.1 KB, `d1bdab9`), the main menu with saved settings (+4.8 KB, `002e8de`), and the debug menu with shadows (+4.1 KB, `85b6700`).
- **The startup split came with 0.3.0.** From `07ca27a` on, Vite builds 2 files and only part of the JavaScript loads at startup. Today that's 19.4 of 42.4 KB.
- **Removing unused code didn't shrink the bundle.** The 2026-11-17 cleanups (`48d7e37`, `f80e063`) changed the build by 0 and +8 bytes: Vite's tree-shaking was already dropping that code. Those cleanups were for the people reading the code, not for size.
- **Upgrading Vite 4 to 6 changed almost nothing:** −52 bytes at `bb937df`.
- **Per-frame work is small:** under 1 ms at the 95th percentile, with no long tasks. Boot, not frame time, is where to look first.

Commit-to-commit differences of about 7 ms or less are noise: that's how far the control moved over one night.

## Limits

- **No assets.** `public/` is private and not in git, so builds have code only. From commit 133 on, requests for chunk data get a 404 and the world loads empty. Real boot with assets is slower; these numbers measure the code's share.
- **Software WebGL.** SwiftShader draws on the CPU. A real GPU is faster, so treat absolute numbers as pessimistic and use them to compare commits.
- **One machine, headless.** AMD Ryzen 7 3700X, Linux, Chromium 159 (see `env.json`). Other machines give other absolute numbers.
- **Cold loads at normal CPU speed only.** The `full` profile (warm cache, 4× CPU slowdown) exists but hasn't been run.
- **FCP comes after first draw** in every measured commit (192 ms vs 119 ms at HEAD). FCP is the browser's paint milestone, not the game's, so use `firstDraw` for when the game starts drawing.

## Reproduce it

From the repo root, on an idle machine:

```sh
pnpm install                                         # also installs the bench (Playwright), a workspace package
pnpm --dir scripts/bench exec playwright install chromium
node --test scripts/bench/lib.test.mjs               # the bench's own tests

# Size: fast and deterministic
node scripts/bench/size-pass.mjs . /tmp/smackhem-bench scripts/bench/results/size.csv

# Boot: hours for the full history. One commit at a time; leave the machine alone.
node scripts/bench/perf-pass.mjs . /tmp/smackhem-bench scripts/bench/results/quick --profile quick
```

Each script prints its options when run without arguments. `--only sha,sha` measures just those commits, and `--every N` measures every Nth commit plus HEAD. Both passes replace their CSV unless given `--append`.

### Keeping it current

`pnpm bench` measures only the commits the CSVs don't have yet, and appends them. It also measures the reference commit (`b58937d`) before and after. If the reference lands outside its overnight range (112–119 ms), the new rows are kept but marked not comparable. If the CPU, Node, Chromium, Playwright or the launch flags changed, it stops before measuring anything. Each run adds a line to `results/quick/checks.csv` and rewrites `results/latest.md` with the newest numbers.

It runs weekly on my machine (a systemd timer, Fridays at 2:00 AM), never in CI: a different machine is a different ruler.

### Weekly run

The timer and its service are templates in [scripts/bench/systemd/](../scripts/bench/systemd/). To install them, from the repo root:

```sh
mkdir -p ~/.config/systemd/user
sed -e "s|@REPO@|$(pwd)|" -e "s|@NODE@|$(command -v node)|" \
  scripts/bench/systemd/smackhem-bench.service > ~/.config/systemd/user/smackhem-bench.service
cp scripts/bench/systemd/smackhem-bench.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now smackhem-bench.timer
```

```sh
systemctl --user list-timers smackhem-bench.timer   # next and last run
journalctl --user -u smackhem-bench                 # what each run printed
systemctl --user start smackhem-bench               # run it now, as the timer would
systemctl --user disable --now smackhem-bench.timer # stop the schedule
```

It's systemd and not cron because it logs to the journal, `systemd-inhibit` keeps the machine awake through a run, and exit 3 (the environment changed) can count as expected instead of failed. It only runs while you're logged in and the machine is awake: a missed Friday is skipped, not caught up. Switching Node versions changes the path in the installed service, so reinstall it (and start a new era, since Node is a stop field).

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, day/night cycle, and display size
- **[Data Formats](data-formats.md)** - Chunk, settings, and save data formats
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, learning path, and publishing
