export type Step = -1 | 0 | 1;

export interface PlayerIntent {
    move: { x: number; y: number };
    // Displacement (mouse delta), applied once per frame
    look: { yaw: number; pitch: number };
    // Rate (stick, -1..1), scaled by dt every tick
    lookRate?: { yaw: number; pitch: number };
    toggleCamera: boolean;
    toggleDebugHUD?: boolean;
    pause?: boolean;
    // Also confirms in menus
    interact?: boolean;
    // Edge-triggered, one menu step per press (keys, D-pad, stick push). y: +1 is up, like move.y
    navigate?: { x: Step; y: Step };
    back?: boolean;
    // From the menu overlay's hit-test: hover selects, clicked confirms, step adjusts a value
    menuPointer?: { index: number; clicked: boolean; step?: -1 | 1 };
}

export interface Input {
    getIntent(): PlayerIntent;
    update(): void;
}
