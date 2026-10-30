import { describe, it, expect } from 'vitest';
import {
    BATTLE_CAMERA_TARGET_HEIGHT,
    DEFAULT_BATTLE_LAYOUT,
    battleCameraInto,
    facingFrom,
    placeCombatants,
} from './battleField';
import type { Combatant } from './battle';
import { createCamera } from '../camera';
import { createEnemy, createPartyMember } from '../combat';
import { ENEMY_SHEETS, PARTY_MEMBER_SHEETS } from '../combatSheets';

const at = (x: number, y: number, z: number) => ({ x, y, z });

const { partyDepth, enemyDepth, spacing } = DEFAULT_BATTLE_LAYOUT;

const combatants = (party: number, enemies: number): Combatant[] => {
    const list: Combatant[] = [];
    for (let i = 0; i < party; i += 1) {
        list.push({
            id: `party:${i}`, side: 'party', unit: createPartyMember(PARTY_MEMBER_SHEETS.circle), position: at(0, 0, 0), home: at(0, 0, 0), atb: 1,
        });
    }
    for (let i = 0; i < enemies; i += 1) {
        list.push({
            id: `enemy:${i}`, side: 'enemy', unit: createEnemy(ENEMY_SHEETS.evil_circle), position: at(0, 0, 0), home: at(0, 0, 0), atb: 1,
        });
    }
    return list;
};

describe('facingFrom', () => {
    it('is the yaw that looks from one point to another, flat on the floor', () => {
        // Yaw 0 looks down -z, the engine's starting view
        expect(facingFrom(at(0, 1.6, 0), at(0, 0, -5))).toBeCloseTo(0, 6);
        // Yaw +90 degrees looks down +x
        expect(facingFrom(at(0, 0, 0), at(3, 0, 0))).toBeCloseTo(Math.PI / 2, 6);
    });
});

describe('placeCombatants', () => {
    it('stands the party between you and the center, and the enemies beyond it, on the NPC\'s floor', () => {
        // Facing down -z from the center at (10, 2, -10)
        const list = combatants(1, 1);

        placeCombatants(list, at(10, 2, -10), 0, DEFAULT_BATTLE_LAYOUT);

        expect(list[0].position).toEqual({ x: 10, y: 2, z: -10 + partyDepth });
        expect(list[1].position.x).toBeCloseTo(10, 6);
        expect(list[1].position.y).toBe(2);
        expect(list[1].position.z).toBeCloseTo(-10 - enemyDepth, 6);
        // Home is the same spot, kept apart so running never moves it
        expect(list[0].home).toEqual(list[0].position);
        expect(list[0].home).not.toBe(list[0].position);
    });

    it('spreads each side out sideways, centered', () => {
        const list = combatants(1, 3);

        placeCombatants(list, at(0, 0, 0), 0, DEFAULT_BATTLE_LAYOUT);

        const xs = list.filter((c) => c.side === 'enemy').map((c) => c.position.x);
        expect(xs[0]).toBeCloseTo(-spacing, 6);
        expect(xs[1]).toBeCloseTo(0, 6);
        expect(xs[2]).toBeCloseTo(spacing, 6);
    });

    it('turns the whole layout with the facing', () => {
        // Facing +x: the party is on the -x side of the center, the enemies on the +x side
        const list = combatants(1, 1);

        placeCombatants(list, at(0, 0, 0), Math.PI / 2, DEFAULT_BATTLE_LAYOUT);

        expect(list[0].position.x).toBeCloseTo(-partyDepth, 6);
        expect(list[1].position.x).toBeCloseTo(enemyDepth, 6);
        expect(list[1].position.z).toBeCloseTo(0, 6);
    });

    it('uses the layout it\'s given', () => {
        const list = combatants(1, 2);

        placeCombatants(list, at(0, 0, 0), 0, { partyDepth: 4, enemyDepth: 3, spacing: 2.5 });

        expect(list[0].position.z).toBeCloseTo(4, 6);
        expect(list[1].position).toEqual({ x: -1.25, y: 0, z: -3 });
        expect(list[2].position).toEqual({ x: 1.25, y: 0, z: -3 });
    });
});

describe('battleCameraInto', () => {
    const battle = {
        center: at(10, 0, -10), facing: 0, layout: DEFAULT_BATTLE_LAYOUT,
    };

    it('looks down by the pitch, along the facing, from the distance back', () => {
        const camera = createCamera();

        battleCameraInto(battle, 15, 7, camera);

        expect(camera.yaw).toBeCloseTo(0, 6);
        expect(camera.pitch).toBeCloseTo(-15 * (Math.PI / 180), 6);
        // Midway between the two lines, a little off the floor
        const target = at(10, BATTLE_CAMERA_TARGET_HEIGHT, -10 - (enemyDepth - partyDepth) / 2);
        const dx = target.x - camera.position.x;
        const dy = target.y - camera.position.y;
        const dz = target.z - camera.position.z;
        expect(Math.sqrt(dx * dx + dy * dy + dz * dz)).toBeCloseTo(7, 6);
        // And the target is straight ahead of it: the view's forward, as lookDirectionInto builds it
        // (getCameraForward flattens pitch away, it's for walking)
        const forward = {
            x: Math.cos(camera.pitch) * Math.sin(camera.yaw),
            y: Math.sin(camera.pitch),
            z: -Math.cos(camera.pitch) * Math.cos(camera.yaw),
        };
        expect(dx / 7).toBeCloseTo(forward.x, 6);
        expect(dy / 7).toBeCloseTo(forward.y, 6);
        expect(dz / 7).toBeCloseTo(forward.z, 6);
    });

    it('sits above the field and behind the party', () => {
        const camera = createCamera();

        battleCameraInto(battle, 15, 7, camera);

        expect(camera.position.y).toBeGreaterThan(BATTLE_CAMERA_TARGET_HEIGHT);
        expect(camera.position.z).toBeGreaterThan(-10 + partyDepth);
    });
});
