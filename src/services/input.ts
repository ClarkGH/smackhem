export type Step = -1 | 0 | 1;

export interface PlayerIntent {
    move: { x: number; y: number };
    look: { yaw: number; pitch: number };
    lookRate?: { yaw: number; pitch: number };
    toggleCamera: boolean;
    toggleDebugHUD?: boolean;
    pause?: boolean;
    interact?: boolean;
    navigate?: { x: Step; y: Step };
    back?: boolean;
    menu?: boolean;
    menuPointer?: { index: number; clicked: boolean; step?: -1 | 1 };
}

export interface Input {
    getIntent(): PlayerIntent;
    update(): void;
}
