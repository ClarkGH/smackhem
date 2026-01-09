export interface PlayerIntent {
    move: { x: number; y: number };
    look: { yaw: number; pitch: number };
    toggleCamera: boolean;
    toggleDebugHUD?: boolean;
}

export interface Input {
    getIntent(): PlayerIntent;
    update(): void;
}
