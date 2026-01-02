/* eslint-disable no-unused-vars */
import type { Vec3 } from '../../types/common';

export interface DebugInfo {
    cameraPosition: Vec3;
    cameraForward: Vec3;
    sunPosition?: Vec3;
    moonPosition?: Vec3;
    timeOfDay?: number;
    lightDirection?: Vec3;
}

export interface DebugHUD {
    render: (info: DebugInfo) => void;
    toggle: () => void;
    isVisible: () => boolean;
    resize: (width: number, height: number) => void;
}

export const createDebugHUD = (canvas: HTMLCanvasElement): DebugHUD => {
    const overlay = document.createElement('canvas');
    overlay.style.position = 'absolute';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.pointerEvents = 'none'; // Don't block mouse input
    overlay.width = canvas.width;
    overlay.height = canvas.height;

    if (canvas.style.position !== 'relative') {
        canvas.style.position = 'relative';
    }

    canvas.parentElement?.appendChild(overlay);

    const ctx = overlay.getContext('2d');
    let visible = false;

    const formatVec3 = (v: Vec3): string => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

    const formatTimeOfDay = (timeOfDay: number): string => {
        const totalSeconds = timeOfDay * 120; // DAY_LENGTH_SECONDS
        const hours = Math.floor(totalSeconds / 60);
        const minutes = Math.floor(totalSeconds % 60);
        return `${timeOfDay.toFixed(2)} (${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')})`;
    };

    return {
        render: (info: DebugInfo) => {
            if (!visible || !ctx) return;
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            ctx.fillStyle = '#ff0000'; // Red color
            ctx.font = '14px monospace';
            ctx.textBaseline = 'top';

            let y = 10;
            const lineHeight = 18;

            // Camera Position
            ctx.fillText(`Camera Position: ${formatVec3(info.cameraPosition)}`, 10, y);
            y += lineHeight;

            // Facing Direction
            ctx.fillText(`Facing Direction: ${formatVec3(info.cameraForward)}`, 10, y);
            y += lineHeight;

            // Light Direction
            if (info.lightDirection) {
                ctx.fillText(`Light Direction: ${formatVec3(info.lightDirection)}`, 10, y);
                y += lineHeight;
            }

            // Sun Position
            if (info.sunPosition) {
                const sunY = info.sunPosition.y;
                const sunText = sunY < 0 ? 'Below Horizon' : formatVec3(info.sunPosition);
                ctx.fillText(`Sun Position: ${sunText}`, 10, y);
                y += lineHeight;
            }

            // Moon Position
            if (info.moonPosition) {
                const moonY = info.moonPosition.y;
                const moonText = moonY < 0 ? 'Below Horizon' : formatVec3(info.moonPosition);
                ctx.fillText(`Moon Position: ${moonText}`, 10, y);
                y += lineHeight;
            }

            // Time of Day
            if (info.timeOfDay !== undefined) {
                ctx.fillText(`Time of Day: ${formatTimeOfDay(info.timeOfDay)}`, 10, y);
            }
        },
        toggle: () => {
            visible = !visible;
            if (ctx) {
                ctx.clearRect(0, 0, overlay.width, overlay.height);
            }
        },
        isVisible: () => visible,
        resize: (width: number, height: number) => {
            overlay.width = width;
            overlay.height = height;
        },
    };
};
