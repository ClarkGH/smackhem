import type { GameState } from './gameState';
import type { MenuScreen } from './menu';
import type { TypeSafeEventBus } from './events';
import {
    clamp,
    MENU_TEXT_SCALES,
    RENDER_SCALES,
    roundStep,
    SENSITIVITY_MAX,
    SENSITIVITY_MIN,
    SENSITIVITY_STEP,
    VOLUME_STEP,
    WINDOW_RESOLUTION_PRESETS,
    type Settings,
} from './settings';
import type { AudioCategory } from '../services/audio';
import type { DisplayCapabilities } from '../services/display';
import type { PlayerIntent } from '../services/input';
import type { MenuView } from '../services/menuOverlay';

export const MENU_SELECT_SOUND = 'ui_menu_select';

type MenuAction = 'new_game' | 'continue' | 'load' | 'open_settings' | 'open_accessibility' | 'back';

// A value row: stepped with left/right or the < > arrows
type MenuSetting =
    | { kind: 'volume'; category: AudioCategory }
    | { kind: 'sensitivity'; key: 'mouseSensitivity' | 'controllerSensitivity' }
    | { kind: 'toggle'; key: 'invertMouseY' | 'invertControllerY' | 'fullscreen' | 'reducedMotion' }
    | { kind: 'renderScale' }
    | { kind: 'textScale' }
    | { kind: 'windowResolution' };

interface MenuItem {
    label: string;
    // What choosing it does. Value rows have a setting instead.
    action?: MenuAction;
    setting?: MenuSetting;
    disabled: boolean;
}

interface MenuScreenData {
    title: string;
    items: MenuItem[];
    // Screen that back returns to, null for the root
    parent: MenuScreen | null;
    // Item on the parent that opens this screen, reselected on the way back
    openedBy: MenuAction | null;
}

const actionItem = (label: string, action: MenuAction, disabled = false): MenuItem => ({ label, action, disabled });

const settingItem = (label: string, setting: MenuSetting, disabled = false): MenuItem => ({ label, setting, disabled });

const NO_DISPLAY_CAPABILITIES: DisplayCapabilities = { fullscreen: false, windowResolution: false };

// Display rows depend on what the platform supports
const displayItems = (capabilities: DisplayCapabilities): MenuItem[] => {
    const items = [settingItem('Render Scale', { kind: 'renderScale' })];
    if (capabilities.windowResolution) {
        items.push(settingItem('Window Size', { kind: 'windowResolution' }));
    }
    items.push(capabilities.fullscreen
        ? settingItem('Fullscreen', { kind: 'toggle', key: 'fullscreen' })
        // e.g. an iframe without fullscreen permission, the page's own button still works
        : settingItem("Fullscreen (use the page's button)", { kind: 'toggle', key: 'fullscreen' }, true));
    return items;
};

// Continue and Load stay disabled until the save system exists
const buildScreens = (capabilities: DisplayCapabilities): Record<MenuScreen, MenuScreenData> => ({
    main: {
        title: 'Smackhem',
        items: [
            actionItem('New Game', 'new_game'),
            actionItem('Continue', 'continue', true),
            actionItem('Load Game', 'load', true),
            actionItem('Settings', 'open_settings'),
        ],
        parent: null,
        openedBy: null,
    },
    settings: {
        title: 'Settings',
        items: [
            settingItem('Master Volume', { kind: 'volume', category: 'master' }),
            settingItem('Music Volume', { kind: 'volume', category: 'music' }),
            settingItem('Ambient Volume', { kind: 'volume', category: 'ambient' }),
            settingItem('SFX Volume', { kind: 'volume', category: 'sfx' }),
            settingItem('UI Volume', { kind: 'volume', category: 'ui' }),
            settingItem('Mouse Sensitivity', { kind: 'sensitivity', key: 'mouseSensitivity' }),
            settingItem('Invert Mouse Y', { kind: 'toggle', key: 'invertMouseY' }),
            settingItem('Controller Sensitivity', { kind: 'sensitivity', key: 'controllerSensitivity' }),
            settingItem('Invert Controller Y', { kind: 'toggle', key: 'invertControllerY' }),
            ...displayItems(capabilities),
            actionItem('Accessibility', 'open_accessibility'),
            actionItem('Back', 'back'),
        ],
        parent: 'main',
        openedBy: 'open_settings',
    },
    accessibility: {
        title: 'Accessibility',
        items: [
            settingItem('Reduced Motion', { kind: 'toggle', key: 'reducedMotion' }),
            settingItem('Menu Text Size', { kind: 'textScale' }),
            actionItem('Back', 'back'),
        ],
        parent: 'settings',
        openedBy: 'open_accessibility',
    },
});

const firstEnabled = (items: MenuItem[]): number => {
    for (let i = 0; i < items.length; i += 1) {
        if (!items[i].disabled) return i;
    }
    return 0;
};

export class MenuSystem {
    private readonly eventBus: TypeSafeEventBus;

    // Shared with the rest of the game, changed in place
    private readonly settings: Settings;

    private readonly screens: Record<MenuScreen, MenuScreenData>;

    private screen: MenuScreen = 'main';

    private selected: number;

    private view: MenuView | null = null;

    private viewChanged = true;

    constructor(
        eventBus: TypeSafeEventBus,
        settings: Settings,
        capabilities: DisplayCapabilities = NO_DISPLAY_CAPABILITIES,
    ) {
        this.eventBus = eventBus;
        this.settings = settings;
        this.screens = buildScreens(capabilities);
        this.selected = firstEnabled(this.screens.main.items);

        // Settings can change from outside the menu, e.g. Escape leaving fullscreen
        this.eventBus.subscribe('settings_changed', () => this.markChanged());
    }

    public update(gameState: GameState, intent: PlayerIntent): void {
        if (intent.menuPointer) {
            this.point(gameState, intent.menuPointer);
        }

        if (intent.navigate && intent.navigate.y !== 0) {
            // +1 is up, which is towards the start of the list
            this.moveSelection(intent.navigate.y > 0 ? -1 : 1);
        }
        if (intent.navigate && intent.navigate.x !== 0) {
            this.adjust(intent.navigate.x > 0 ? 1 : -1);
        }

        if (intent.back) {
            this.goBack();
        } else if (intent.interact) {
            this.choose(gameState);
        }
    }

    // Mouse, from the overlay's hit-test. Same paths as keyboard and controller.
    private point(gameState: GameState, pointer: NonNullable<PlayerIntent['menuPointer']>): void {
        const { items } = this.screens[this.screen];
        if (pointer.index < 0 || pointer.index >= items.length) return;

        // Hover selects, disabled items included, they just can't be chosen
        if (pointer.index !== this.selected) {
            this.selected = pointer.index;
            this.markChanged();
        }

        // The < > arrows step the value, anywhere else on the row chooses it
        if (pointer.step) {
            this.adjust(pointer.step);
        } else if (pointer.clicked) {
            this.choose(gameState);
        }
    }

    // Changes since the last call, so the overlay only redraws when needed (M-1)
    public consumeViewChanged(): boolean {
        const changed = this.viewChanged;
        this.viewChanged = false;
        return changed;
    }

    public getView(): MenuView {
        if (!this.view) {
            const data = this.screens[this.screen];
            this.view = {
                title: data.title,
                items: data.items.map((item) => ({
                    label: item.label,
                    value: item.setting ? this.valueText(item.setting) : undefined,
                    adjustable: item.setting !== undefined,
                    disabled: item.disabled,
                })),
                selected: this.selected,
                textScale: this.settings.menuTextScale,
            };
        }
        return this.view;
    }

    private markChanged(): void {
        this.view = null;
        this.viewChanged = true;
    }

    // Wraps around and skips disabled items
    private moveSelection(direction: -1 | 1): void {
        const { items } = this.screens[this.screen];
        let next = this.selected;
        for (let i = 0; i < items.length; i += 1) {
            next = (next + direction + items.length) % items.length;
            if (!items[next].disabled) break;
        }
        if (next === this.selected) return;
        this.selected = next;
        this.markChanged();
    }

    private choose(gameState: GameState): void {
        const item = this.screens[this.screen].items[this.selected];
        if (item.disabled) return;

        if (item.setting) {
            // Confirm flips a toggle, it does nothing on a slider
            if (item.setting.kind === 'toggle') {
                this.playSelectSound();
                this.changeSetting(item.setting, 1);
            }
            return;
        }

        this.playSelectSound();

        switch (item.action) {
            case 'new_game':
                this.startNewGame(gameState);
                break;
            case 'open_settings':
                this.openScreen('settings');
                break;
            case 'open_accessibility':
                this.openScreen('accessibility');
                break;
            case 'back':
                this.returnToParent();
                break;
            default:
                // continue and load wait for the save system
                break;
        }
    }

    // Value steps are silent, the changing value is the feedback
    private adjust(step: -1 | 1): void {
        const item = this.screens[this.screen].items[this.selected];
        if (item.disabled || !item.setting) return;
        this.changeSetting(item.setting, step);
    }

    private changeSetting(setting: MenuSetting, step: -1 | 1): void {
        const { settings } = this;

        switch (setting.kind) {
            case 'volume': {
                const current = settings.volume[setting.category];
                const next = clamp(roundStep(current + step * VOLUME_STEP), 0, 1);
                if (next === current) return;
                settings.volume[setting.category] = next;
                this.eventBus.publish({ type: 'audio_bus_volume_changed', category: setting.category, volume: next });
                break;
            }
            case 'sensitivity': {
                const current = settings[setting.key];
                const next = clamp(roundStep(current + step * SENSITIVITY_STEP), SENSITIVITY_MIN, SENSITIVITY_MAX);
                if (next === current) return;
                settings[setting.key] = next;
                break;
            }
            case 'toggle':
                // For fullscreen this is a request, the platform's answer comes back through bindDisplay
                settings[setting.key] = !settings[setting.key];
                break;
            case 'textScale': {
                const index = MENU_TEXT_SCALES.indexOf(settings.menuTextScale);
                const next = MENU_TEXT_SCALES[clamp(index + step, 0, MENU_TEXT_SCALES.length - 1)];
                if (next === settings.menuTextScale) return;
                settings.menuTextScale = next;
                break;
            }
            case 'renderScale': {
                const index = RENDER_SCALES.indexOf(settings.renderScale);
                const next = RENDER_SCALES[clamp(index + step, 0, RENDER_SCALES.length - 1)];
                if (next === settings.renderScale) return;
                settings.renderScale = next;
                break;
            }
            case 'windowResolution': {
                // null (match the display) first, then the presets
                const current = settings.windowResolution;
                const index = current
                    ? WINDOW_RESOLUTION_PRESETS.findIndex((r) => r.width === current.width && r.height === current.height) + 1
                    : 0;
                const nextIndex = clamp(index + step, 0, WINDOW_RESOLUTION_PRESETS.length);
                if (nextIndex === index) return;
                settings.windowResolution = nextIndex === 0 ? null : { ...WINDOW_RESOLUTION_PRESETS[nextIndex - 1] };
                break;
            }
            default:
                return;
        }

        this.eventBus.publish({ type: 'settings_changed' });
        this.markChanged();
    }

    private valueText(setting: MenuSetting): string {
        switch (setting.kind) {
            case 'volume':
                return `${Math.round(this.settings.volume[setting.category] * 100)}%`;
            case 'sensitivity':
                return `${this.settings[setting.key].toFixed(1)}x`;
            case 'toggle':
                return this.settings[setting.key] ? 'On' : 'Off';
            case 'renderScale':
                return `${Math.round(this.settings.renderScale * 100)}%`;
            case 'textScale':
                return `${this.settings.menuTextScale}x`;
            case 'windowResolution': {
                const resolution = this.settings.windowResolution;
                return resolution ? `${resolution.width}x${resolution.height}` : 'Display';
            }
            default:
                return '';
        }
    }

    private goBack(): void {
        if (!this.screens[this.screen].parent) return;
        this.playSelectSound();
        this.returnToParent();
    }

    private openScreen(screen: MenuScreen): void {
        this.screen = screen;
        this.selected = firstEnabled(this.screens[screen].items);
        this.markChanged();
    }

    private returnToParent(): void {
        const { parent, openedBy } = this.screens[this.screen];
        if (!parent) return;

        const parentItems = this.screens[parent].items;
        this.screen = parent;
        this.selected = firstEnabled(parentItems);
        for (let i = 0; i < parentItems.length; i += 1) {
            if (parentItems[i].action === openedBy) this.selected = i;
        }
        this.markChanged();
    }

    private startNewGame(gameState: GameState): void {
        const previousMode = gameState.discrete.gameMode;
        // Mindfully overriding memory
        gameState.discrete.gameMode = 'world_3d';
        this.eventBus.publish({
            type: 'game_mode_changed',
            previousMode,
            currentMode: 'world_3d',
        });
        // Leaving the menu, the overlay hides
        this.markChanged();
    }

    private playSelectSound(): void {
        this.eventBus.publish({ type: 'play_sound_requested', soundId: MENU_SELECT_SOUND, category: 'ui' });
    }
}

export default MenuSystem;
