import type { GameState } from './gameState';
import type { PlayerIntent } from '../services/input';
import type { Vec3 } from '../types/common';
import type { World } from './world';

// How close, across the floor, the interactor has to be to an interactable's edge (not its centre)
export const INTERACT_RANGE = 2.0;

// How far off straight ahead an NPC can be and still be talked to (45 degrees)
const INTERACT_FACING_COS = Math.cos(Math.PI / 4);

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

// The flat direction a yaw looks in, written into out so it can run every tick (M-1).
// Matches getCameraForward(yaw, 0), which interaction.spec checks.
export const flatForwardInto = (yaw: number, out: Vec3): Vec3 => {
    out.x = Math.sin(yaw);
    out.y = 0;
    out.z = -Math.cos(yaw);
    return out;
};

export default class InteractionSystem {
    private readonly forward: Vec3 = { x: 0, y: 0, z: -1 };

    constructor(private world: World) {}

    /**
     * Every tick with no conversation open (GameLoop closes conversations itself).
     * The target is what the prompt shows and what Interact reaches, so the two can't disagree.
     */
    public update(gameState: GameState, intent: PlayerIntent, interactor: Interactor): void {
        const npc = this.findTarget(this.world.getVisibleNpcs(), interactor);
        gameState.discrete.interactTarget = npc ? npc.id : null;

        if (intent.interact && npc) {
            gameState.discrete.activeSpeech = { npcId: npc.id, line: npc.line };
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
