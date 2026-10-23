import {
    describe,
    it,
    expect,
    vi,
} from 'vitest';
import LocalStorageStore from './localStorageStore';
import MemoryStore from '../stub/memoryStore';
import type { KeyValueStore } from '../../services/storage';

const installLocalStorage = (storage: Partial<Storage>): void => {
    vi.stubGlobal('window', { localStorage: storage });
};

// Contract: what core relies on from any KeyValueStore
const describeStoreContract = (name: string, create: () => KeyValueStore): void => {
    describe(`KeyValueStore contract: ${name}`, () => {
        it('reads back what it stored, and null for unknown keys', () => {
            const store = create();

            store.set('smackhem.test', 'value');

            expect(store.get('smackhem.test')).toBe('value');
            expect(store.get('smackhem.unknown')).toBeNull();
        });
    });
};

describeStoreContract('MemoryStore', () => new MemoryStore());
describeStoreContract('LocalStorageStore', () => {
    const values = new Map<string, string>();
    installLocalStorage({
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
    });
    return new LocalStorageStore();
});

describe('LocalStorageStore', () => {
    it('never throws when storage is blocked (private browsing, full quota)', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        installLocalStorage({
            getItem: () => { throw new Error('SecurityError'); },
            setItem: () => { throw new Error('QuotaExceededError'); },
        });
        const store = new LocalStorageStore();

        expect(store.get('smackhem.settings')).toBeNull();
        expect(() => store.set('smackhem.settings', '{}')).not.toThrow();
    });
});
