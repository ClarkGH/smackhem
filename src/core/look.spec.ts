import {
    describe,
    it,
    expect,
    vi,
} from 'vitest';
import { TypeSafeEventBus } from './events';
import { createGameState, type GameMode, type GameState } from './gameState';
import { GameLoop } from './gameLoop';
import { World } from './world';
import { createDefaultSettings, type Settings } from './settings';
import NullRenderer from '../platforms/stub/nullRenderer';
import StubInput from '../platforms/stub/stubInput';

const FIXED_DT = 1 / 60;
// Keeps float error from dropping the last tick of a multi-tick frame
const EPSILON = 1e-9;

const createLoop = (
    mode: GameMode = 'world_3d',
    settings: Settings = createDefaultSettings(),
): { input: StubInput; gameState: GameState; gameLoop: GameLoop } => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const input = new StubInput();
    const gameState = createGameState(mode);
    const gameLoop = new GameLoop(
        new NullRenderer(),
        input,
        new World(),
        () => 16 / 9,
        new TypeSafeEventBus(),
        gameState,
        undefined,
        undefined,
        settings,
    );
    return { input, gameState, gameLoop };
};

describe('look - scenario (stub platform)', () => {
    it('applies the same mouse movement once, however many ticks the frame runs', () => {
        const oneTick = createLoop();
        oneTick.input.setIntent({ look: { yaw: 100, pitch: 0 } });
        oneTick.gameLoop.update(FIXED_DT + EPSILON);

        const threeTicks = createLoop();
        threeTicks.input.setIntent({ look: { yaw: 100, pitch: 0 } });
        threeTicks.gameLoop.update(FIXED_DT * 3 + EPSILON);

        expect(oneTick.gameState.interpolated.cameraYaw).not.toBe(0);
        expect(threeTicks.gameState.interpolated.cameraYaw).toBeCloseTo(oneTick.gameState.interpolated.cameraYaw);
    });

    it('keeps mouse movement from a frame that runs no tick', () => {
        const { input, gameState, gameLoop } = createLoop();

        // Half a tick: no simulation this frame
        input.setIntent({ look: { yaw: 100, pitch: 0 } });
        gameLoop.update(FIXED_DT / 2);
        expect(gameState.interpolated.cameraYaw).toBe(0);

        // The next frame completes the tick without new movement
        input.reset();
        gameLoop.update(FIXED_DT / 2 + EPSILON);
        expect(gameState.interpolated.cameraYaw).not.toBe(0);
    });

    it('turns at a steady rate while the stick is held', () => {
        const { input, gameState, gameLoop } = createLoop();
        input.setIntent({ lookRate: { yaw: 1, pitch: 0 } });

        gameLoop.update(FIXED_DT + EPSILON);
        const afterOne = gameState.interpolated.cameraYaw;
        gameLoop.update(FIXED_DT);
        const afterTwo = gameState.interpolated.cameraYaw;

        expect(afterOne).toBeGreaterThan(0);
        expect(afterTwo).toBeCloseTo(afterOne * 2);
    });

    it('drops mouse movement made in the menu, so New Game starts without a jolt', () => {
        const { input, gameState, gameLoop } = createLoop('main_menu');

        input.setIntent({ look: { yaw: 500, pitch: 0 } });
        gameLoop.update(FIXED_DT + EPSILON);
        input.reset();

        input.setIntent({ interact: true });
        gameLoop.update(FIXED_DT);
        input.reset();
        gameLoop.update(FIXED_DT);

        expect(gameState.discrete.gameMode).toBe('world_3d');
        expect(gameState.interpolated.cameraYaw).toBe(0);
    });
});

describe('render interpolation - scenario (stub platform)', () => {
    it('draws the camera between the last two ticks', () => {
        const { input, gameState, gameLoop } = createLoop();
        const startZ = gameState.interpolated.cameraPosition.z;

        // One tick of walking forward
        input.setIntent({ move: { x: 0, y: 1 } });
        gameLoop.update(FIXED_DT + EPSILON);
        input.reset();
        const tickZ = gameState.interpolated.cameraPosition.z;
        expect(tickZ).not.toBeCloseTo(startZ);

        // Right after the tick, the drawn camera is still at the previous tick
        expect(gameLoop.getRenderCamera().position.z).toBeCloseTo(startZ);

        // Half a tick later, it's halfway
        gameLoop.update(FIXED_DT / 2);
        expect(gameLoop.getRenderCamera().position.z).toBeCloseTo((startZ + tickZ) / 2);
    });

    it('blends turning the same way', () => {
        const { input, gameState, gameLoop } = createLoop();

        input.setIntent({ lookRate: { yaw: 1, pitch: 0 } });
        gameLoop.update(FIXED_DT + EPSILON);
        input.reset();
        const tickYaw = gameState.interpolated.cameraYaw;

        gameLoop.update(FIXED_DT / 4);

        expect(gameLoop.getRenderCamera().yaw).toBeCloseTo(tickYaw / 4);
    });
});

describe('look settings - scenario (stub platform)', () => {
    // Yaw and pitch after one tick of the given input
    const lookOnce = (settings: Settings, mouse: number, stick: number): { yaw: number; pitch: number } => {
        const { input, gameState, gameLoop } = createLoop('world_3d', settings);
        input.setIntent({ look: { yaw: mouse, pitch: mouse }, lookRate: { yaw: stick, pitch: stick } });
        gameLoop.update(FIXED_DT + EPSILON);
        return { yaw: gameState.interpolated.cameraYaw, pitch: gameState.interpolated.cameraPitch };
    };

    it('mouse sensitivity scales only the mouse', () => {
        const fast = createDefaultSettings();
        fast.mouseSensitivity = 2;

        expect(lookOnce(fast, 10, 0).yaw).toBeCloseTo(lookOnce(createDefaultSettings(), 10, 0).yaw * 2);
        expect(lookOnce(fast, 0, 0.5).yaw).toBeCloseTo(lookOnce(createDefaultSettings(), 0, 0.5).yaw);
    });

    it('controller sensitivity scales only the stick', () => {
        const fast = createDefaultSettings();
        fast.controllerSensitivity = 2;

        expect(lookOnce(fast, 0, 0.5).yaw).toBeCloseTo(lookOnce(createDefaultSettings(), 0, 0.5).yaw * 2);
        expect(lookOnce(fast, 10, 0).yaw).toBeCloseTo(lookOnce(createDefaultSettings(), 10, 0).yaw);
    });

    it('each invert flips only its own device, and only up/down', () => {
        const invertMouse = createDefaultSettings();
        invertMouse.invertMouseY = true;
        const normal = createDefaultSettings();

        expect(lookOnce(invertMouse, 10, 0).pitch).toBeCloseTo(-lookOnce(normal, 10, 0).pitch);
        expect(lookOnce(invertMouse, 10, 0).yaw).toBeCloseTo(lookOnce(normal, 10, 0).yaw);
        expect(lookOnce(invertMouse, 0, 0.5).pitch).toBeCloseTo(lookOnce(normal, 0, 0.5).pitch);

        const invertStick = createDefaultSettings();
        invertStick.invertControllerY = true;
        expect(lookOnce(invertStick, 0, 0.5).pitch).toBeCloseTo(-lookOnce(normal, 0, 0.5).pitch);
        expect(lookOnce(invertStick, 10, 0).pitch).toBeCloseTo(lookOnce(normal, 10, 0).pitch);
    });
});
