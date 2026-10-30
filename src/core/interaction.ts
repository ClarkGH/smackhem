import type { GameState } from './gameState';
import type { PlayerIntent } from '../services/input';
import type { Vec3 } from '../types/common';
import type { AABB } from './math/aabb';
import type { World } from './world';
import { flatForwardInto, PLAYER_RADIUS } from './camera';

// How close, across the floor, the interactor has to be to an interactable's edge (not its centre)
export const INTERACT_RANGE = 2.0;

// What a hostile NPC asks. One shared array, never copied per conversation (M-1).
// The refusal is last, so Back can always pick it (see GameLoop).
export const ENCOUNTER_OPTIONS: readonly string[] = ['Yes', 'No'];

// The option that starts the fight (see BattleSystem)
export const ENCOUNTER_YES = 0;

// How far off straight ahead an NPC can be and still be talked to (45 degrees)
const INTERACT_FACING_COS = Math.cos(Math.PI / 4);

// How close, across the floor, the interactor's centre has to be to a touch NPC's box to be touching it.
// Collision stops the player PLAYER_RADIUS from a box, so this is a little more than that.
export const CONTACT_RANGE = PLAYER_RADIUS + 0.1;

// Distance across the floor from a point to a box, 0 inside it. Height is ignored, like reach.
const flatDistanceToBox = (point: Vec3, box: AABB): number => {
    const dx = Math.max(box.min.x - point.x, 0, point.x - box.max.x);
    const dz = Math.max(box.min.z - point.z, 0, point.z - box.max.z);
    return Math.sqrt(dx * dx + dz * dz);
};

// Whoever is doing the talking: the first-person camera in the world, the circle in the instance.
// Only GameLoop knows which. facing is a yaw, or null to reach all the way round.
export interface Interactor {
    position: Vec3;
    facing: number | null;
}

// Anything that can be aimed at. NPCs are the only kind so far.
export interface Interactable {
    id: string;
    position: Vec3;
    size: number;
}

export default class InteractionSystem {
    private readonly forward: Vec3 = { x: 0, y: 0, z: -1 };

    // The touch NPC the interactor was against last time, so a fight starts on stepping into contact,
    // not on standing there: after running away you're still against it, and that mustn't start it again
    private touchingId: string | null = null;

    constructor(private world: World) {}

    // A new run hasn't touched anyone yet
    public reset(): void {
        this.touchingId = null;
    }

    /**
     * Every exploring tick with no conversation open, after the interactor has moved: the id of a touch NPC
     * (startsFightOn 'touch') it has just come into contact with, or null. Only the step in counts.
     */
    public findNewContact(interactor: Interactor): string | null {
        const npcs = this.world.getVisibleNpcs();
        let touching: string | null = null;
        for (let i = 0; i < npcs.length && touching === null; i += 1) {
            if (npcs[i].startsFightOn === 'touch' && flatDistanceToBox(interactor.position, npcs[i].collisionAABB) <= CONTACT_RANGE) {
                touching = npcs[i].id;
            }
        }
        const isNew = touching !== null && touching !== this.touchingId;
        this.touchingId = touching;
        return isNew ? touching : null;
    }

    /**
     * Every tick with no conversation open (GameLoop closes conversations itself).
     * The target is what the prompt shows and what Interact reaches, so the two can't disagree.
     */
    public update(gameState: GameState, intent: PlayerIntent, interactor: Interactor): void {
        const npc = this.findTarget(this.world.getVisibleNpcs(), interactor);
        gameState.discrete.interactTarget = npc ? npc.id : null;

        if (intent.interact && npc) {
            // A hostile NPC's line ends in a question, opening on Yes
            const choice = npc.encounterId !== undefined ? { options: ENCOUNTER_OPTIONS, selected: 0 } : null;
            gameState.discrete.activeSpeech = { npcId: npc.id, line: npc.line, choice };
        }
    }

    // The nearest candidate in reach, and in front when the interactor has a facing.
    // Reach and nearness go by the candidate's edge, so a big one is reachable from where it looks reachable.
    // Generic, so each kind of interactable gets back its own type.
    private findTarget<T extends Interactable>(candidates: readonly T[], interactor: Interactor): T | null {
        const forward = interactor.facing === null ? null : flatForwardInto(interactor.facing, this.forward);
        let nearest: T | null = null;
        let nearestEdge = INTERACT_RANGE;

        for (let i = 0; i < candidates.length; i += 1) {
            // Across the floor, ignoring height
            const dx = candidates[i].position.x - interactor.position.x;
            const dz = candidates[i].position.z - interactor.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const edge = distance - candidates[i].size / 2;
            // Facing goes by the centre. Standing on top of it counts as facing it.
            const inFront = forward === null || distance < 0.0001
                || (dx * forward.x + dz * forward.z) / distance >= INTERACT_FACING_COS;
            if (edge <= nearestEdge && inFront) {
                nearest = candidates[i];
                nearestEdge = edge;
            }
        }

        return nearest;
    }
}
