import { describe, it, expect } from 'vitest';
import doc from '../docs/project-structure.md?raw';

// Keeps docs/project-structure.md's src/ tree in step with the files on disk, both ways.
// File names are unique across src/ (see the doc's naming conventions), so a name is enough.
// Vite lists the files (the keys only, nothing is imported), so tsconfig needs no Node types.

// Gitignored and private (see CLAUDE.md), so never listed file by file
const sourcePaths = Object.keys(import.meta.glob([
    './**/*',
    '!./platforms/cpu/**',
    '!./platforms/native/**',
    '!./platforms/console/**',
]));

// This spec, which the glob doesn't see from inside itself
const onDisk = sourcePaths.map((path) => path.slice(path.lastIndexOf('/') + 1)).concat('projectStructure.spec.ts');

// File names in the doc's src/ tree, the lines like "│  ├─ camera.ts   # ..."
const treeStart = doc.indexOf('```text\nsrc/');
const tree = doc.slice(treeStart, doc.indexOf('```', treeStart + 3));
const documented: string[] = [];
tree.split('\n').forEach((line) => {
    const match = /[├└]─ ([\w.]+\.\w+)/.exec(line);
    if (match) documented.push(match[1]);
});

describe('docs/project-structure.md', () => {
    it('finds the src/ tree', () => {
        expect(documented.length).toBeGreaterThan(0);
    });

    it('lists every file in src/', () => {
        expect(onDisk.filter((name) => !documented.includes(name))).toEqual([]);
    });

    it('lists no file that is gone', () => {
        expect(documented.filter((name) => !onDisk.includes(name))).toEqual([]);
    });
});
