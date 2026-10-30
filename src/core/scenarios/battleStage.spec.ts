import {
    describe,
    it,
    expect,
    vi,
} from 'vitest';
import type { NpcJSON } from '../chunkLoader';
import type { Mat4, Vec3 } from '../../types/common';
import { setHp } from '../combat';
import { DEFAULT_BATTLE_LAYOUT } from '../battle/battleField';
import { createDebugSettings, type DebugSettings } from '../settings/debugSettings';
import { createScenario, type Scenario } from '../../testing/scenario';

// Dead ahead of the player (at the origin, looking down -z), so the fight faces down -z
const HOSTILE: NpcJSON = {
    id: 'npc_evil_circle_1',
    sprite: 'evil_circle_idle_1',
    pos: [0, 0, -1.5],
    size: 1,
    line: 'Me Fight! You want figh?!',
    encounterId: 'npc_evil_circle_1',
};

const DEG = Math.PI / 180;

const withHostile = (debug: DebugSettings = createDebugSettings()): Scenario & { debug: DebugSettings } => {
    const scenario = createScenario({ debugSettings: debug });
    scenario.addChunk({ npcs: [HOSTILE] });
    return { ...scenario, debug };
};

const startFight = (scenario: Scenario): void => {
    scenario.press({ interact: true });
    scenario.press({ interact: true });
    scenario.tick();
};

// Lets the stub renderer's texture promises resolve
const settleLoads = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

interface DrawnQuad {
    texture: string;
    x: number;
    y: number;
    z: number;
    normal: Vec3;
}

/**
 * Records every textured quad drawn from now on. Copied at call time: RenderSystem reuses one matrix
 * and one normal for every billboard (M-1), like the real renderer's drawList copies them.
 */
const recordQuads = (scenario: Scenario): DrawnQuad[] => {
    const drawn: DrawnQuad[] = [];
    vi.spyOn(scenario.renderer, 'drawTexturedQuad').mockImplementation((texture, model: Mat4, normal) => {
        const m = model.elements;
        drawn.push({
            texture: texture.id, x: m[12], y: m[13], z: m[14], normal: { ...(normal as Vec3) },
        });
    });
    return drawn;
};

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-4;

describe('The battle field - scenario (stub platform)', () => {
    it('stands the party between you and the NPC\'s spot, and the enemies beyond, facing the way you faced it', () => {
        const scenario = withHostile();

        startFight(scenario);

        const battle = scenario.gameState.discrete.battle!;
        expect(battle.center).toEqual({ x: 0, y: 0, z: -1.5 });
        expect(battle.facing).toBeCloseTo(0, 6);
        const [party, enemy] = battle.combatants;
        expect(party.position.z).toBeCloseTo(-1.5 + DEFAULT_BATTLE_LAYOUT.partyDepth, 6);
        expect(enemy.position.z).toBeCloseTo(-1.5 - DEFAULT_BATTLE_LAYOUT.enemyDepth, 6);
    });

    it('lays the fight out from the Debug layout, copied at the start, so a change mid-fight waits for the next one', () => {
        const scenario = withHostile();
        scenario.debug.battleLayout.enemyDepth = 3;

        startFight(scenario);
        const battle = scenario.gameState.discrete.battle!;
        expect(battle.combatants[1].position.z).toBeCloseTo(-1.5 - 3, 6);

        // Moved mid-fight: this fight's lines and the camera's copy stay as they were
        scenario.debug.battleLayout.enemyDepth = 5;
        expect(battle.layout.enemyDepth).toBe(3);
        expect(battle.layout).not.toBe(scenario.debug.battleLayout);
    });

    it('never moves the world\'s NPC (W-1)', () => {
        const scenario = withHostile();

        startFight(scenario);

        expect(scenario.world.findNpc('npc_evil_circle_1')?.position).toEqual({ x: 0, y: 0, z: -1.5 });
    });
});

describe('The battle camera - scenario (stub platform)', () => {
    it('frames the fight from 15 degrees down and 7 units back, then hands back the exploration camera unchanged', () => {
        const scenario = withHostile();
        const before = { ...scenario.gameLoop.getRenderCamera().position };

        startFight(scenario);
        const camera = scenario.gameLoop.getRenderCamera();
        expect(camera.pitch).toBeCloseTo(-15 * DEG, 6);
        expect(camera.yaw).toBeCloseTo(0, 6);
        expect(camera.position.y).toBeGreaterThan(1);

        const { battle } = scenario.gameState.discrete;
        battle!.outcome = 'won';
        scenario.tick();
        const after = scenario.gameLoop.getRenderCamera();
        expect(after.pitch).toBeCloseTo(0, 6);
        expect(after.position).toEqual(before);
    });

    it('follows the debug menu\'s pitch and distance', () => {
        const scenario = withHostile();
        startFight(scenario);
        const at7 = { ...scenario.gameLoop.getRenderCamera().position };

        scenario.debug.battleCameraPitchDeg = 40;
        scenario.debug.battleCameraDistance = 10;
        scenario.tick();

        const camera = scenario.gameLoop.getRenderCamera();
        expect(camera.pitch).toBeCloseTo(-40 * DEG, 6);
        expect(camera.position.y).toBeGreaterThan(at7.y);
    });
});

describe('Drawing the fight - scenario (stub platform)', () => {
    it('draws each combatant at its battle spot, and not the NPC at its world spot', async () => {
        const scenario = withHostile();
        startFight(scenario);
        scenario.tick();
        await settleLoads();
        const drawn = recordQuads(scenario);

        scenario.tick();

        const battle = scenario.gameState.discrete.battle!;
        battle.combatants.forEach((c) => {
            expect(drawn.some((q) => near(q.x, c.position.x) && near(q.z, c.position.z))).toBe(true);
        });
        expect(drawn.some((q) => near(q.z, -1.5))).toBe(false);
        // Each one with its own sheet's sprite
        expect(drawn.find((q) => near(q.z, battle.combatants[0].position.z))?.texture).toMatch(/^stub_texture_circle_sleep_1/);
        expect(drawn.find((q) => near(q.z, battle.combatants[1].position.z))?.texture).toMatch(/^stub_texture_evil_circle_idle_1/);
    });

    it('leaves a defeated enemy off the field', async () => {
        const scenario = withHostile();
        startFight(scenario);
        await settleLoads();
        const battle = scenario.gameState.discrete.battle!;
        const enemyAt = { ...battle.combatants[1].position };
        setHp(battle.combatants[1].unit, 2);
        // Attack, the target, and off it runs
        scenario.press({ interact: true });
        scenario.press({ interact: true });
        const drawn = recordQuads(scenario);

        // Skipping the run lands the finishing blow: its beat plays with the enemy down
        scenario.press({ interact: true });

        expect(drawn.length).toBeGreaterThan(0);
        expect(drawn.some((q) => near(q.z, enemyAt.z))).toBe(false);
    });

    // Any drawn mesh flattened nearly to nothing is a blob: the floor and the instance circle aren't that thin
    const recordBlobs = (scenario: Scenario): Vec3[] => {
        const shadows: Vec3[] = [];
        vi.spyOn(scenario.renderer, 'drawMesh').mockImplementation((_mesh, model) => {
            const m = model.elements;
            if (m[5] < 0.1) shadows.push({ x: m[12], y: m[13], z: m[14] });
        });
        return shadows;
    };

    it('draws no blob shadows by default', () => {
        const scenario = withHostile();
        startFight(scenario);
        const shadows = recordBlobs(scenario);

        scenario.tick();

        expect(shadows).toHaveLength(0);
    });

    it('puts a blob shadow on the floor under each combatant when switched on', () => {
        const scenario = withHostile({ ...createDebugSettings(), blobShadows: true });
        startFight(scenario);
        const shadows = recordBlobs(scenario);

        scenario.tick();

        const battle = scenario.gameState.discrete.battle!;
        expect(shadows).toHaveLength(battle.combatants.length);
        battle.combatants.forEach((c, i) => {
            expect(shadows[i].x).toBeCloseTo(c.position.x, 6);
            expect(shadows[i].z).toBeCloseTo(c.position.z, 6);
            expect(shadows[i].y).toBeGreaterThan(c.position.y);
            expect(shadows[i].y).toBeLessThan(c.position.y + 0.05);
        });
    });
});

describe('Billboard tilt toggle - scenario (stub platform)', () => {
    // The facing normal of every quad drawn on the next frame, once textures are in
    const normalsNextFrame = async (scenario: Scenario): Promise<Vec3[]> => {
        scenario.tick();
        await settleLoads();
        const drawn = recordQuads(scenario);
        scenario.tick();
        return drawn.map((q) => q.normal);
    };

    it('stands billboards upright by default, as the engine always has', async () => {
        const scenario = withHostile();
        startFight(scenario);

        const normals = await normalsNextFrame(scenario);

        expect(normals.length).toBeGreaterThan(0);
        normals.forEach((n) => expect(n.y).toBe(0));
    });

    it('leans them back to face a camera that looks down, when switched on', async () => {
        const scenario = withHostile();
        scenario.debug.billboardTilt = true;
        startFight(scenario);

        const normals = await normalsNextFrame(scenario);

        expect(normals.length).toBeGreaterThan(0);
        normals.forEach((n) => {
            // Towards the camera above: up and back, still a unit vector
            expect(n.y).toBeGreaterThan(0);
            expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
        });
    });
});

describe('Battle camera and billboard debug rows - scenario (stub platform)', () => {
    const labels = (scenario: Scenario): string[] => scenario.overlay.lastView?.items.map((item) => item.label) ?? [];
    const valueOf = (scenario: Scenario, label: string): string | undefined => {
        const index = labels(scenario).indexOf(label);
        return scenario.overlay.lastView?.items[index]?.value;
    };
    const step = (scenario: Scenario, label: string, direction: -1 | 1): void => {
        const index = labels(scenario).indexOf(label);
        scenario.press({ menuPointer: { index, clicked: false, step: direction } });
    };

    const openDebug = (): Scenario & { debug: DebugSettings } => {
        const scenario = withHostile();
        scenario.press({ menu: true });
        scenario.click('Debug');
        return scenario;
    };

    it('toggles billboard tilt', () => {
        const scenario = openDebug();
        expect(valueOf(scenario, 'Tilt Billboards')).toBe('Off');

        scenario.click('Tilt Billboards');

        expect(scenario.debug.billboardTilt).toBe(true);
        expect(valueOf(scenario, 'Tilt Billboards')).toBe('On');
    });

    it('steps the battle camera\'s pitch by 5 degrees and its distance by half a unit, within limits', () => {
        const scenario = openDebug();
        expect(valueOf(scenario, 'Battle Cam Pitch')).toBe('15°');
        expect(valueOf(scenario, 'Battle Cam Distance')).toBe('7.0');

        step(scenario, 'Battle Cam Pitch', 1);
        step(scenario, 'Battle Cam Distance', -1);
        expect(scenario.debug.battleCameraPitchDeg).toBe(20);
        expect(scenario.debug.battleCameraDistance).toBe(6.5);
        expect(valueOf(scenario, 'Battle Cam Pitch')).toBe('20°');

        for (let i = 0; i < 30; i += 1) step(scenario, 'Battle Cam Pitch', 1);
        expect(scenario.debug.battleCameraPitchDeg).toBe(75);
    });

    it('toggles blob shadows, off to start', () => {
        const scenario = openDebug();
        expect(valueOf(scenario, 'Blob Shadows')).toBe('Off');

        scenario.click('Blob Shadows');

        expect(scenario.debug.blobShadows).toBe(true);
    });

    it('steps the battle layout by a quarter unit, within limits', () => {
        const scenario = openDebug();
        expect(valueOf(scenario, 'Battle Party Depth')).toBe('2.00');
        expect(valueOf(scenario, 'Battle Spacing')).toBe('1.50');

        step(scenario, 'Battle Party Depth', 1);
        step(scenario, 'Battle Enemy Depth', -1);
        step(scenario, 'Battle Spacing', 1);
        expect(scenario.debug.battleLayout).toEqual({ partyDepth: 2.25, enemyDepth: 1.25, spacing: 1.75 });
        expect(valueOf(scenario, 'Battle Party Depth')).toBe('2.25');

        for (let i = 0; i < 40; i += 1) step(scenario, 'Battle Enemy Depth', -1);
        for (let i = 0; i < 40; i += 1) step(scenario, 'Battle Spacing', 1);
        expect(scenario.debug.battleLayout.enemyDepth).toBe(0.5);
        expect(scenario.debug.battleLayout.spacing).toBe(5);
    });
});
