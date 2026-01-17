import type { Vec3 } from '../types/common';

/**
 * InstanceCharacter represents a single 2D character/entity in an instance.
 * Used for party members, NPCs, and enemies.
 */

export interface InstanceCharacter {
    position: Vec3; // 3D world position (on floor plane for now)
    // Future: sprite/texture reference
    // Future: collision bounds (AABB for 2D)
    // Future: type (party member, NPC, enemy)
}

export const createInstanceCharacter = (position: Vec3): InstanceCharacter => ({
    position: { ...position },
});
