import type { KeyValueStore } from '../../services/storage';

/**
 * Stub key-value store for testing (Rule P-1), kept in memory
 */
export default class MemoryStore implements KeyValueStore {
    private values = new Map<string, string>();

    public get(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    public set(key: string, value: string): void {
        this.values.set(key, value);
    }
}
