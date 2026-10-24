import { describe, it, expect } from 'vitest';
import { createDefaultSettings, type Settings } from '../settings/settings';
import { createScenario, FIXED_DT } from '../../testing/scenario';

// Keeps float error from dropping the last tick of a multi-tick frame
const EPSILON = 1e-9;

describe('look - scenario (stub platform)', () => {
    it('applies the same mouse movement once, however many ticks the frame runs', () => {
        const oneTick = createScenario();
        oneTick.input.setIntent({ look: { yaw: 100, pitch: 0 } });
        oneTick.frame(FIXED_DT);

        const threeTicks = createScenario();
        threeTicks.input.setIntent({ look: { yaw: 100, pitch: 0 } });
        threeTicks.frame(FIXED_DT * 3 + EPSILON);

        expect(oneTick.gameState.interpolated.cameraYaw).not.toBe(0);
        expect(threeTicks.gameState.interpolated.cameraYaw).toBeCloseTo(oneTick.gameState.interpolated.cameraYaw);
    });

    it('keeps mouse movement from a frame that runs no tick', () => {
        const { input, gameState, frame } = createScenario();

        // Half a tick: no simulation this frame
        input.setIntent({ look: { yaw: 100, pitch: 0 } });
        frame(FIXED_DT / 2);
        expect(gameState.interpolated.cameraYaw).toBe(0);

        // The next frame completes the tick without new movement
        frame(FIXED_DT / 2 + EPSILON);
        expect(gameState.interpolated.cameraYaw).not.toBe(0);
    });

    it('turns at a steady rate while the stick is held', () => {
        const { input, gameState, tick } = createScenario();
        input.setIntent({ lookRate: { yaw: 1, pitch: 0 } });

        tick();
        const afterOne = gameState.interpolated.cameraYaw;
        tick();
        const afterTwo = gameState.interpolated.cameraYaw;

        expect(afterOne).toBeGreaterThan(0);
        expect(afterTwo).toBeCloseTo(afterOne * 2);
    });

    it('drops mouse movement made in the menu, so New Game starts without a jolt', () => {
        const { gameState, press, tick } = createScenario({ mode: 'main_menu' });

        press({ look: { yaw: 500, pitch: 0 } });
        press({ interact: true });
        tick();

        expect(gameState.discrete.gameMode).toBe('world_3d');
        expect(gameState.interpolated.cameraYaw).toBe(0);
    });
});

describe('render interpolation - scenario (stub platform)', () => {
    it('draws the camera between the last two ticks', () => {
        const {
            input, gameState, gameLoop, tick, frame,
        } = createScenario();
        const startZ = gameState.interpolated.cameraPosition.z;

        // One tick of walking forward
        input.setIntent({ move: { x: 0, y: 1 } });
        tick();
        input.reset();
        const tickZ = gameState.interpolated.cameraPosition.z;
        expect(tickZ).not.toBeCloseTo(startZ);

        // Right after the tick, the drawn camera is still at the previous tick
        expect(gameLoop.getRenderCamera().position.z).toBeCloseTo(startZ);

        // Half a tick later, it's halfway
        frame(FIXED_DT / 2);
        expect(gameLoop.getRenderCamera().position.z).toBeCloseTo((startZ + tickZ) / 2);
    });

    it('blends turning the same way', () => {
        const {
            input, gameState, gameLoop, tick, frame,
        } = createScenario();

        input.setIntent({ lookRate: { yaw: 1, pitch: 0 } });
        tick();
        input.reset();
        const tickYaw = gameState.interpolated.cameraYaw;

        frame(FIXED_DT / 4);

        expect(gameLoop.getRenderCamera().yaw).toBeCloseTo(tickYaw / 4);
    });
});

describe('look settings - scenario (stub platform)', () => {
    // Yaw and pitch after one tick of the given input
    const lookOnce = (settings: Settings, mouse: number, stick: number): { yaw: number; pitch: number } => {
        const { gameState, press } = createScenario({ settings });
        press({ look: { yaw: mouse, pitch: mouse }, lookRate: { yaw: stick, pitch: stick } });
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
