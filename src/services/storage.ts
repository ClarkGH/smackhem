/**
 * Key-value storage service interface
 * Synchronous and string-based, the shape of localStorage. Native backends write a file.
 * Implementations never throw: a failed read returns null, a failed write is logged.
 */
export interface KeyValueStore {
    get(key: string): string | null;
    set(key: string, value: string): void;
}
