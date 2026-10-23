export interface Resolution {
    width: number;
    height: number;
}

/**
 * What the platform can do. The menu only shows options the platform supports.
 * Web: windowResolution is false (the page sizes the game), fullscreen depends on the iframe's permissions.
 */
export interface DisplayCapabilities {
    fullscreen: boolean;
    windowResolution: boolean;
}

/**
 * Display service interface
 * Applies display settings. Core asks, the platform decides what actually happens.
 */
export interface DisplayService {
    capabilities(): DisplayCapabilities;
    // Drawing buffer = presented size x scale (0.5 - 1). Trades quality for performance.
    setRenderScale(scale: number): void;
    // Native window size, null matches the display. Ignored where capabilities().windowResolution is false
    setWindowResolution(resolution: Resolution | null): void;
    // May be refused (no user gesture, iframe without permission), see onFullscreenChange
    setFullscreen(enabled: boolean): void;
    // Reports the real fullscreen state, including exits the game didn't ask for (Escape)
    onFullscreenChange(handler: (enabled: boolean) => void): void;
}
