import { describe, it, expect } from 'vitest';
import {
    World, CHUNK_SIZE, type Chunk, type Npc,
} from './world';
import { createAABB, type AABB } from './math/aabb';

// A chunk at grid (x, z) with one box, and optionally one NPC
const chunkAt = (x: number, z: number, options: { hasContent?: boolean; npc?: Npc } = {}): Chunk => {
    const cx = x * CHUNK_SIZE;
    const cz = z * CHUNK_SIZE;
    return {
        id: World.getChunkID(x, z),
        bounds: createAABB(
            { x: cx - CHUNK_SIZE / 2, y: -1, z: cz - CHUNK_SIZE / 2 },
            { x: cx + CHUNK_SIZE / 2, y: 5, z: cz + CHUNK_SIZE / 2 },
        ),
        collisionAABBs: [createAABB({ x: cx, y: 0, z: cz }, { x: cx + 1, y: 1, z: cz + 1 })],
        meshes: [{ mesh: { id: `mesh-${x},${z}` }, transform: { elements: new Float32Array(16) }, color: { x: 0, y: 0, z: 0 } }],
        hasContent: options.hasContent ?? true,
        npcs: options.npc ? [options.npc] : [],
    };
};

const npcAt = (id: string, x: number, z: number): Npc => ({
    id,
    textureId: 'lmao_idle_1',
    position: { x, y: 0, z },
    size: 1,
    collisionAABB: createAABB({ x: x - 0.5, y: 0, z: z - 0.5 }, { x: x + 0.5, y: 1, z: z + 0.5 }),
    line: 'Hi',
    startsFightOn: 'talk',
});

// A wall standing on the line x = 5, between chunks (0, 0) and (1, 0)
const isWallBetweenZeroAndEast = (wall: AABB): boolean => wall.min.x < 5 && wall.max.x > 5 && wall.min.z >= -5 && wall.max.z <= 5;

describe('World', () => {
    describe('boundary walls', () => {
        it('walls in a lone chunk on all four sides', () => {
            const world = new World();
            world.addChunk(chunkAt(0, 0));

            expect(world.getBoundaryWallAABBs()).toHaveLength(4);
        });

        it('opens the shared side when a neighbour arrives, and closes it again when it leaves', () => {
            const world = new World();
            world.addChunk(chunkAt(0, 0));
            expect(world.getBoundaryWallAABBs().some(isWallBetweenZeroAndEast)).toBe(true);

            world.addChunk(chunkAt(1, 0));
            // Three each, none on the shared side
            expect(world.getBoundaryWallAABBs()).toHaveLength(6);
            expect(world.getBoundaryWallAABBs().some(isWallBetweenZeroAndEast)).toBe(false);

            world.removeChunk('1,0');
            expect(world.getBoundaryWallAABBs()).toHaveLength(4);
            expect(world.getBoundaryWallAABBs().some(isWallBetweenZeroAndEast)).toBe(true);
        });

        it('keeps the wall against a neighbour with no map data', () => {
            const world = new World();
            world.addChunk(chunkAt(0, 0));
            world.addChunk(chunkAt(1, 0, { hasContent: false }));

            expect(world.getBoundaryWallAABBs().some(isWallBetweenZeroAndEast)).toBe(true);
        });
    });

    describe('cached lists', () => {
        it('collides with chunk boxes, NPC boxes and walls', () => {
            const world = new World();
            const npc = npcAt('npc_lmao_1', 2, 2);
            const chunk = chunkAt(0, 0, { npc });
            chunk.collisionAABBs.push(npc.collisionAABB);
            world.addChunk(chunk);

            const collidable = world.getCollidableAABBs();

            expect(collidable).toContain(chunk.collisionAABBs[0]);
            expect(collidable).toContain(npc.collisionAABB);
            world.getBoundaryWallAABBs().forEach((wall) => expect(collidable).toContain(wall));
            expect(collidable).toHaveLength(2 + 4);
        });

        it('follows chunks in and out: meshes, NPCs and collision', () => {
            const world = new World();
            world.addChunk(chunkAt(0, 0, { npc: npcAt('a', 1, 1) }));
            world.addChunk(chunkAt(3, 3, { npc: npcAt('b', 31, 31) }));
            expect(world.getVisibleMeshes()).toHaveLength(2);
            expect(world.getVisibleNpcs().map((npc) => npc.id)).toEqual(['a', 'b']);

            world.removeChunk('3,3');

            expect(world.getVisibleMeshes()).toHaveLength(1);
            expect(world.getVisibleNpcs().map((npc) => npc.id)).toEqual(['a']);
            expect(world.findNpc('b')).toBeUndefined();
            expect(world.findNpc('a')?.id).toBe('a');
            // The lone chunk left: its box and its four walls
            expect(world.getCollidableAABBs()).toHaveLength(1 + 4);
        });

        it('hands back the same arrays until a chunk changes, so play ticks rebuild nothing', () => {
            const world = new World();
            world.addChunk(chunkAt(0, 0));
            const collidable = world.getCollidableAABBs();
            const firstBox = collidable[0];

            expect(world.getCollidableAABBs()).toBe(collidable);
            expect(world.getCollidableAABBs()[0]).toBe(firstBox);
            expect(world.getVisibleMeshes()).toBe(world.getVisibleMeshes());
            expect(world.getBoundaryWallAABBs()).toBe(world.getBoundaryWallAABBs());
        });

        it('ignores removing a chunk that was never added', () => {
            const world = new World();
            world.addChunk(chunkAt(0, 0));

            world.removeChunk('9,9');

            expect(world.getCollidableAABBs()).toHaveLength(1 + 4);
        });
    });
});
