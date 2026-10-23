import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import { createGame, type Game } from './game';
import { SETTINGS_STORAGE_KEY } from './core/settings';
import createStubPlatform, { createChunkUpdater } from './platforms/stub/stubBootstrap';
import type StubInput from './platforms/stub/stubInput';
import type StubClock from './platforms/stub/stubClock';
import type NullMenuOverlay from './platforms/stub/nullMenuOverlay';
import type StubAudioService from './platforms/stub/stubAudioService';
import type StubDisplay from './platforms/stub/stubDisplay';
import type MemoryStore from './platforms/stub/memoryStore';
import type { PlatformServices } from './services/platform';
import type { PlayerIntent } from './services/input';

// The stub platform's concrete services, for driving and inspecting them
interface StubServices {
    input: StubInput;
    clock: StubClock;
    menu: NullMenuOverlay;
    audio: StubAudioService;
    display: StubDisplay;
    storage: MemoryStore;
}

/**
 * Boot smoke test: the real wiring (createGame, the same code main.ts runs) on the stub platform.
 * Covers everything main.ts used to do inline: settings load/save, display, audio, chunks, GameLoop.
 * main.ts itself only picks the platform; its imports are checked by the bundler-mode typecheck.
 */
describe('createGame on the stub platform', () => {
    let platform: PlatformServices;
    let stub: StubServices;
    let game: Game;

    const boot = async (): Promise<void> => {
        game = await createGame({ platform, updateChunks: createChunkUpdater() });
    };

    const press = (intent: Partial<PlayerIntent>): void => {
        stub.input.setIntent(intent);
        game.frame();
    };

    const frames = (count: number): void => {
        for (let i = 0; i < count; i += 1) game.frame();
    };

    const click = (label: string): void => {
        const index = stub.menu.lastView?.items.findIndex((item) => item.label === label) ?? -1;
        if (index < 0) throw new Error(`No menu item "${label}" on screen`);
        press({ menuPointer: { index, clicked: true } });
    };

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        platform = await createStubPlatform();
        stub = platform as unknown as StubServices;
        stub.clock.setFixedDeltaTime(1 / 60);
    });

    it('boots into the main menu with chunks loaded and sounds ready', async () => {
        await boot();
        game.frame();

        expect(game.gameState.discrete.gameMode).toBe('main_menu');
        expect(stub.menu.lastView?.title).toBe('Smackhem');
        expect(game.world.activeChunks.size).toBeGreaterThan(0);
    });

    it('plays a whole session: New Game, walk, pause, quit, and New Game again', async () => {
        await boot();
        game.frame();

        press({ interact: true });
        expect(game.gameState.discrete.gameMode).toBe('world_3d');

        // Walk for a second
        stub.input.setIntent({ move: { x: 0, y: 1 } });
        frames(60);
        stub.input.reset();
        expect(game.gameState.interpolated.cameraPosition).not.toEqual({ x: 0, y: 1.6, z: 0 });

        press({ menu: true });
        expect(stub.menu.lastView?.title).toBe('Paused');

        click('Quit to Main Menu');
        click('Yes, quit');
        frames(3);
        expect(game.gameState.discrete.gameMode).toBe('main_menu');
        expect(stub.menu.lastView?.title).toBe('Smackhem');

        press({ interact: true });
        expect(game.gameState.discrete.gameMode).toBe('world_3d');
    });

    it('plays the menu, mode and ambient sounds through the real audio wiring', async () => {
        await boot();
        game.frame();

        press({ interact: true });
        frames(2);

        const played = stub.audio.playCalls.map((call) => call.id);
        expect(played).toContain('ui_menu_select');
        expect(played).toContain('sfx_mode_change');
        expect(played).toContain('ambient_night');
    });

    it('applies saved settings on boot: volumes, render scale', async () => {
        stub.storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ volume: { music: 0.3 }, renderScale: 0.5 }));

        await boot();
        game.frame();

        expect(game.settings.volume.music).toBe(0.3);
        expect(stub.audio.getVolume('music')).toBe(0.3);
        expect(stub.display.renderScale).toBe(0.5);
    });

    it('saves a changed setting, and the next boot loads it', async () => {
        await boot();
        game.frame();

        click('Settings');
        // Master Volume is selected first, step it down
        press({ navigate: { x: -1, y: 0 } });
        expect(JSON.parse(stub.storage.get(SETTINGS_STORAGE_KEY) ?? '{}').volume.master).toBe(0.9);

        // A fresh game on the same storage
        const next = await createGame({
            platform: { ...await createStubPlatform(), storage: stub.storage },
            updateChunks: createChunkUpdater(),
        });
        expect(next.settings.volume.master).toBe(0.9);
    });

    it('loads chunks for each game separately', async () => {
        await boot();
        const first = game.world.activeChunks.size;

        await boot();

        expect(game.world.activeChunks.size).toBe(first);
    });
});
