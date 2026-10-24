import type { TypeSafeEventBus } from '../events';
import type { Settings } from './settings';
import type { DisplayService } from '../../services/display';

/**
 * Keeps the platform display in step with Settings: applied now and on every settings_changed.
 * Fullscreen is a request. The platform can refuse it, or the player can leave with Escape,
 * so settings.fullscreen follows whatever the platform reports back.
 */
export const bindDisplay = (eventBus: TypeSafeEventBus, settings: Settings, display: DisplayService): void => {
    // Last fullscreen state asked for or reported, so a request isn't repeated while pending
    let fullscreen = false;

    const apply = (): void => {
        display.setRenderScale(settings.renderScale);
        display.setWindowResolution(settings.windowResolution);
        if (settings.fullscreen !== fullscreen) {
            fullscreen = settings.fullscreen;
            display.setFullscreen(fullscreen);
        }
    };

    display.onFullscreenChange((enabled) => {
        fullscreen = enabled;
        if (settings.fullscreen === enabled) return;
        settings.fullscreen = enabled;
        eventBus.publish({ type: 'settings_changed' });
    });

    eventBus.subscribe('settings_changed', apply);
    apply();
};

export default bindDisplay;
