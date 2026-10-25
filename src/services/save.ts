import type { Vec3 } from '../types/common';

export type SaveSlot = 'auto' | 'save_point';

/**
 * A save is a snapshot of a stable moment: save points and autosave only,
 * taken in world_3d with nothing transitioning, so no transition state is stored.
 */
export interface SaveData {
    version: 1;
    slot: SaveSlot;
    world: {
        cameraPosition: Vec3;
        cameraYaw: number;
        simulationTime: number;
        timeOfDay: number;
    };
    // Event/quest flags, empty until the flag system exists
    flags: Record<string, boolean>;
}

export interface SaveSlotInfo {
    slot: SaveSlot;
    // Stamped by the platform when saved, core never reads the clock (T-2)
    savedAt: number;
}

/**
 * Save service interface (seam only, not implemented yet)
 * Implementations encrypt saves at rest (authenticated, e.g. AES-GCM) so they aren't
 * readable or casually editable. Core always sees plain SaveData. A save that fails
 * to decrypt is treated as corrupt or missing, never a crash.
 */
export interface SaveService {
    list(): Promise<SaveSlotInfo[]>;
    load(slot: SaveSlot): Promise<SaveData | null>;
    save(slot: SaveSlot, data: SaveData): Promise<void>;
}
