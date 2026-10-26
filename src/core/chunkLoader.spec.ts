import {
    describe, it, expect, vi,
} from 'vitest';
import { ChunkLoader } from './chunkLoader';
import NullRenderer from '../platforms/stub/nullRenderer';
import { CHUNK_SIZE } from './world';

// One mesh of each solid shape, base at pos[1], in chunk (1, 2)
const SHAPES = [
    { type: 'cube', pos: [1, 0, 1], scale: [2, 2, 2] },
    { type: 'pyramid', pos: [-2, 0, 3], scale: [3, 3, 3] },
    { type: 'sphere', pos: [3, 1.5, -2], scale: [2, 2, 2] },
    { type: 'prism', pos: [-3, 4, -3], scale: [1, 6, 2] },
] as const;

// Where each shape's mesh has its bottom, relative to its origin: cubes, spheres and
// prisms are centered on their origin, a pyramid's base sits on it
const bottomOffset = (shape: (typeof SHAPES)[number]): number => {
    switch (shape.type) {
        case 'pyramid': return 0;
        case 'prism': return -shape.scale[1] / 2;
        default: return -shape.scale[0] / 2;
    }
};

// The height each shape is drawn at
const height = (shape: (typeof SHAPES)[number]): number => (shape.type === 'prism' ? shape.scale[1] : shape.scale[0]);

const load = (meshes: object[]) => {
    const json = JSON.stringify({ version: 2, id: '1,2', meshes });
    return new ChunkLoader().loadChunkFromJSON(json, 1, 2, new NullRenderer());
};

describe('ChunkLoader mesh placement', () => {
    it('draws every shape with its base at pos[1], floating ones included', () => {
        const chunk = load([...SHAPES]);
        SHAPES.forEach((shape, i) => {
            const origin = chunk.meshes[i].transform.elements;
            expect(origin[12]).toBeCloseTo(1 * CHUNK_SIZE + shape.pos[0], 6);
            expect(origin[14]).toBeCloseTo(2 * CHUNK_SIZE + shape.pos[2], 6);
            // The drawn bottom: the origin plus where the mesh's bottom is relative to it
            expect(origin[13] + bottomOffset(shape)).toBeCloseTo(shape.pos[1], 6);
        });
    });

    it('gives every shape a collision box matching what is drawn', () => {
        const chunk = load([...SHAPES]);
        SHAPES.forEach((shape, i) => {
            const box = chunk.collisionAABBs[i];
            expect(box.min.y).toBeCloseTo(shape.pos[1], 6);
            expect(box.max.y).toBeCloseTo(shape.pos[1] + height(shape), 6);
        });
    });

    it('treats a cube as one size, warning when the scale is uneven', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const chunk = load([{ type: 'cube', pos: [0, 0, 0], scale: [1, 3, 1] }]);
        // Only the cube warning, whatever else the loader logs
        const cubeWarnings = warn.mock.calls.filter(([message]) => String(message).startsWith('Cube with uneven scale'));
        expect(cubeWarnings).toHaveLength(1);
        // Drawn as a 1-unit cube, sitting on the floor, with a matching 1-unit box
        expect(chunk.meshes[0].transform.elements[13]).toBeCloseTo(0.5, 6);
        expect(chunk.collisionAABBs[0].max.y).toBeCloseTo(1, 6);
        expect(chunk.collisionAABBs[0].max.z - chunk.collisionAABBs[0].min.z).toBeCloseTo(1, 6);
    });
});

describe('ChunkLoader schema version', () => {
    const versionWarnings = (version: number): number => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const json = JSON.stringify({ version, id: '0,0', meshes: [] });
        new ChunkLoader().loadChunkFromJSON(json, 0, 0, new NullRenderer());
        return warn.mock.calls.filter(([message]) => String(message).startsWith('Chunk JSON version mismatch')).length;
    };

    it('loads the current version (2) quietly', () => {
        expect(versionWarnings(2)).toBe(0);
    });

    it('warns about an older file, but still loads it', () => {
        expect(versionWarnings(1)).toBe(1);
    });
});

describe('ChunkLoader NPCs', () => {
    const NPC = {
        id: 'npc_01', sprite: 'npc-lmao', pos: [1.5, 0.5, -2], size: 1, line: 'Hello',
    };

    const loadNpcs = (npcs?: object[]) => {
        const json = JSON.stringify({
            version: 2, id: '1,2', meshes: [], npcs,
        });
        return new ChunkLoader().loadChunkFromJSON(json, 1, 2, new NullRenderer());
    };

    it('places an NPC relative to the chunk center, with its sprite and line', () => {
        const [npc] = loadNpcs([NPC]).npcs;

        expect(npc).toMatchObject({
            id: 'npc_01',
            textureId: 'npc-lmao',
            size: 1,
            line: 'Hello',
            position: { x: 1 * CHUNK_SIZE + 1.5, y: 0.5, z: 2 * CHUNK_SIZE - 2 },
        });
    });

    it('gives it a collision box from its base up by its size, shared with the chunk', () => {
        const chunk = loadNpcs([NPC]);
        const box = chunk.npcs[0].collisionAABB;

        expect(box.min).toEqual({ x: 11, y: 0.5, z: 17.5 });
        expect(box.max).toEqual({ x: 12, y: 1.5, z: 18.5 });
        // The same object, so collision sees it
        expect(chunk.collisionAABBs).toContain(box);
    });

    it('skips an infinite size, which JSON gives for 1e999', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        // Built by hand, JSON.stringify would write Infinity as null
        const json = `{ "version": 2, "id": "1,2", "meshes": [], "npcs": [
            { "id": "huge", "sprite": "npc-lmao", "pos": [0, 0, 0], "size": 1e999, "line": "Hi" }
        ] }`;

        const chunk = new ChunkLoader().loadChunkFromJSON(json, 1, 2, new NullRenderer());

        expect(chunk.npcs).toEqual([]);
        expect(chunk.collisionAABBs).toEqual([]);
    });

    it('loads a chunk without npcs as none', () => {
        expect(loadNpcs(undefined).npcs).toEqual([]);
    });

    it('skips a bad entry with a warning, keeping the rest', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const chunk = loadNpcs([
            { ...NPC, id: 'no_line', line: undefined },
            { ...NPC, id: 'zero_size', size: 0 },
            NPC,
        ]);

        expect(chunk.npcs.map((npc) => npc.id)).toEqual(['npc_01']);
        expect(chunk.collisionAABBs).toHaveLength(1);
        expect(warn.mock.calls.filter(([message]) => String(message).startsWith('Skipping NPC'))).toHaveLength(2);
    });
});
