import type { Vec3 } from '../../types/common';
import type { Camera } from '../camera';
import { flatForwardInto, flatRightInto } from '../camera';
import type { BattleState, Combatant } from './battle';

/**
 * Where a fight stands and how it's framed (battle.md, The field and the battle camera). Pure layout math, no drawing (R-1).
 * The field is the spot the NPC stood on. The party lines up between you and it, the enemies beyond it,
 * both across the facing, so the fight plays out where you are, Chrono Trigger style.
 */

// How a fight is laid out. Tuned from the Debug screen, copied into the fight when it starts (battle.md, Debug).
export interface BattleLayout {
    // Units from the center, along the facing: the party back towards you, the enemies away
    partyDepth: number;
    enemyDepth: number;
    // Units between neighbours on the same side
    spacing: number;
}

export const DEFAULT_BATTLE_LAYOUT: Readonly<BattleLayout> = { partyDepth: 2, enemyDepth: 1.5, spacing: 1.5 };

// Every combatant's billboard, width and height
export const BATTLE_SPRITE_SIZE = 1;

// How high above the floor the camera aims: about the middle of a 1-unit billboard
export const BATTLE_CAMERA_TARGET_HEIGHT = 0.5;

const DEG_TO_RAD = Math.PI / 180;

// Scratch for the layout, filled in place (M-1)
const forward: Vec3 = { x: 0, y: 0, z: -1 };
const right: Vec3 = { x: 1, y: 0, z: 0 };

/**
 * The yaw that looks from one point to another across the floor, ignoring height.
 * It inverts flatForwardInto: yaw 0 looks down -z, and +90 degrees looks down +x.
 */
export const facingFrom = (from: Vec3, to: Vec3): number => Math.atan2(to.x - from.x, -(to.z - from.z));

// Positions one side's line: depth along the facing (negative is towards you), spread across it, centered
const placeLine = (line: Combatant[], center: Vec3, depth: number, spacing: number): void => {
    for (let i = 0; i < line.length; i += 1) {
        const across = (i - (line.length - 1) / 2) * spacing;
        const { home, position } = line[i];
        // Written in place (M-1)
        home.x = center.x + forward.x * depth + right.x * across;
        home.y = center.y;
        home.z = center.z + forward.z * depth + right.z * across;
        // They start at home. Two objects, so running only ever moves position.
        position.x = home.x;
        position.y = home.y;
        position.z = home.z;
    }
};

/**
 * Stands everyone on the field. Called once when the fight is built, which is the allocation boundary
 * (M-1), so splitting the sides into two short lists here is fine.
 */
export const placeCombatants = (
    combatants: Combatant[],
    center: Vec3,
    facing: number,
    layout: Readonly<BattleLayout>,
): void => {
    flatForwardInto(facing, forward);
    flatRightInto(facing, right);
    placeLine(combatants.filter((c) => c.side === 'party'), center, -layout.partyDepth, layout.spacing);
    placeLine(combatants.filter((c) => c.side === 'enemy'), center, layout.enemyDepth, layout.spacing);
};

/**
 * The battle camera, written into out: looking along the facing, pitchDeg down, distance back from the
 * middle of the field. Only position, yaw and pitch are written, the lens stays as out has it.
 * Render-only: it never touches the exploration camera, so there's nothing to restore when the fight ends.
 */
export const battleCameraInto = (
    battle: Pick<BattleState, 'center' | 'facing' | 'layout'>,
    pitchDeg: number,
    distance: number,
    out: Camera,
): void => {
    const { center, facing, layout } = battle;
    flatForwardInto(facing, forward);
    // Midway between the two lines, a little off the floor. The fight's own layout, so it matches where people stand.
    const mid = (layout.enemyDepth - layout.partyDepth) / 2;
    const targetX = center.x + forward.x * mid;
    const targetY = center.y + BATTLE_CAMERA_TARGET_HEIGHT;
    const targetZ = center.z + forward.z * mid;

    // Looking down is a negative pitch. The view direction is the flat forward tipped down by it.
    const pitch = -pitchDeg * DEG_TO_RAD;
    const cos = Math.cos(pitch);
    const sin = Math.sin(pitch);

    // Written in place (M-1)
    out.yaw = facing;
    out.pitch = pitch;
    // Step back from the target against the view direction
    out.position.x = targetX - forward.x * cos * distance;
    out.position.y = targetY - sin * distance;
    out.position.z = targetZ - forward.z * cos * distance;
};
