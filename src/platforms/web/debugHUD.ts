import type { Vec3 } from '../../types/common';

export interface DebugInfo {
    cameraPosition: Vec3;
    cameraForward: Vec3;
    sunPosition?: Vec3;
    // moonPosition?: Vec3;
    timeOfDay?: number;
    yaw?: number;
    pitch?: number;
}

export const createDebugHUD = (canvas: HTMLCanvasElement): {
    render: (_info: DebugInfo) => void;
    toggle: () => void;
    isVisible: () => boolean;
} => {
    // Create 2D canvas overlay positioned on top of WebGL canvas
    const overlay = document.createElement('canvas');

    // Position overlay to match canvas
    const updateOverlaySize = () => {
        const rect = canvas.getBoundingClientRect();
        overlay.style.position = 'absolute';
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.width = `${canvas.width}px`;
        overlay.style.height = `${canvas.height}px`;
        overlay.width = canvas.width;
        overlay.height = canvas.height;
    };

    updateOverlaySize();
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '1000';
    overlay.style.position = 'absolute';
    overlay.style.backgroundColor = 'transparent';
    document.body.appendChild(overlay);

    // Update overlay size when window resizes
    window.addEventListener('resize', updateOverlaySize);

    const ctx = overlay.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to create 2D context for debug HUD');
    }

    let visible = false;

    const formatVec3 = (v: Vec3): string => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

    const formatTime = (timeOfDay: number): string => {
        // Convert timeOfDay (0-1) to hours:minutes format
        const totalMinutes = timeOfDay * 24 * 60;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = Math.floor(totalMinutes % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    const getCardinalDirection = (yaw: number): string => {
        // Normalize yaw to 0-2π range
        const normalizedYaw = ((yaw % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
        
        // Convert to degrees for easier comparison
        const degrees = (normalizedYaw * 180) / Math.PI;
        
        // Determine cardinal direction
        // yaw=0 faces -Z (North), yaw=π/2 faces +X (East), yaw=π faces +Z (South), yaw=3π/2 faces -X (West)
        if (degrees >= 315 || degrees < 45) {
            return 'North';
        } else if (degrees >= 45 && degrees < 135) {
            return 'East';
        } else if (degrees >= 135 && degrees < 225) {
            return 'South';
        } else {
            return 'West';
        }
    };

    const render = (info: DebugInfo): void => {
        if (!visible || !ctx) return;

        // Update overlay size/position in case canvas moved
        updateOverlaySize();

        // Clear the overlay
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        // Set font and color with stroke for visibility
        ctx.font = '14px monospace';
        ctx.textBaseline = 'top';

        // Helper function to draw text with outline for visibility
        const drawText = (text: string, x: number, y: number) => {
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.strokeText(text, x, y);
            ctx.fillStyle = 'red';
            ctx.fillText(text, x, y);
        };

        let y = 10;
        const lineHeight = 20;

        // Camera Position
        drawText(
            `Camera Position: ${formatVec3(info.cameraPosition)}`,
            10,
            y,
        );
        y += lineHeight;

        // Facing Direction
        drawText(
            `Facing Direction: ${formatVec3(info.cameraForward)}`,
            10,
            y,
        );
        y += lineHeight;

        // Cardinal Direction and Yaw/Pitch
        if (info.yaw !== undefined) {
            const cardinal = getCardinalDirection(info.yaw);
            const yawDeg = (info.yaw * 180) / Math.PI;
            drawText(
                `Direction: ${cardinal} (Yaw: ${yawDeg.toFixed(1)}°)`,
                10,
                y,
            );
            y += lineHeight;
        }

        if (info.pitch !== undefined) {
            const pitchDeg = (info.pitch * 180) / Math.PI;
            drawText(
                `Pitch: ${pitchDeg.toFixed(1)}°`,
                10,
                y,
            );
            y += lineHeight;
        }

        // Sun Position
        if (info.sunPosition) {
            drawText(
                `Sun Position: ${formatVec3(info.sunPosition)}`,
                10,
                y,
            );
            y += lineHeight;
        }

        // Moon Position
        // if (info.moonPosition) {
        //     drawText(
        //         `Moon Position: ${formatVec3(info.moonPosition)}`,
        //         10,
        //         y,
        //     );
        //     y += lineHeight;
        // }

        // Time of Day
        if (info.timeOfDay !== undefined) {
            const timeStr = formatTime(info.timeOfDay);
            drawText(
                `Time of Day: ${info.timeOfDay.toFixed(3)} (${timeStr})`,
                10,
                y,
            );
        }
    };

    const toggle = (): void => {
        visible = !visible;
        console.log(`Debug HUD ${visible ? 'enabled' : 'disabled'}`);
        if (!visible && ctx) {
            // Clear when hiding
            ctx.clearRect(0, 0, overlay.width, overlay.height);
        } else if (visible) {
            // Update position when showing
            updateOverlaySize();
        }
    };

    const isVisible = (): boolean => visible;

    return { render, toggle, isVisible };
};
