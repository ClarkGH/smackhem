import { Mat4, Vec3 } from "src/types/common";
import { createIdentityMatrix } from "./gameLoop";

class Camera {
    private target: { yaw: number, pitch: number, pos: [number, number, number] };
    private current: { yaw: number, pitch: number, pos: [number, number, number] };
    private lerpSpeed: number;
    private isFreeCameraActive: boolean;
    private fov: number; // TODO: Make this field of view a thing

    // TODO: Feed arguments from config file
    constructor() {
        this.isFreeCameraActive = true; // TODO: Get from config file

        const yPos = this.isFreeCameraActive ? 2 : 1.7; // TODO: Consider moving the free camera height to update

        this.target =  { yaw: 0, pitch: 0, pos: [0, yPos, 0] }; // TODO: Get from game state
        this.current = { yaw: 0, pitch: 0, pos: [0, yPos, 0] }; // TODO: Get from game state
        this.fov = this.isFreeCameraActive ? 90 : 45; // TODO: Get from config
        this.lerpSpeed = 10.0; // Higher = snappier
    }

    handleInput(deltaYaw: number, deltaPitch: number) {
        this.target.yaw += deltaYaw;
        this.target.pitch = Math.max(-1.5, Math.min(1.5, this.target.pitch + deltaPitch)); // Clamp ~86 deg
    }
    
    update(dt: number) {
        // Explicit smoothing independent of browser refresh rate
        const t = 1.0 - Math.exp(-this.lerpSpeed * dt);
        this.current.yaw += (this.target.yaw - this.current.yaw) * t;
        this.current.pitch += (this.target.pitch - this.current.pitch) * t;
    }
}

export default Camera;
