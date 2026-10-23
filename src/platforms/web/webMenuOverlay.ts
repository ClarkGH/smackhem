import type { MenuOverlay, MenuView } from '../../services/menuOverlay';
import type { PlayerIntent } from '../../services/input';
import {
    hitTestMenu,
    scrollToSelection,
    toBufferCoords,
    type MenuItemRects,
} from './menuHitTest';

const BASE_FONT_SIZE = 24;

type MenuPointer = NonNullable<PlayerIntent['menuPointer']>;

// Where mouse input goes, wired to the input service by webBootstrap
export interface MenuOverlayInput {
    pointer: (pointer: MenuPointer) => void;
    back: () => void;
}

/**
 * Web menu overlay: plain text on a 2D canvas on top of the WebGL canvas, like the debug HUD.
 * Draws only when core hands it a changed view. While visible it takes mouse events,
 * hit-tests them against what it drew, and reports items (never coordinates) to the input service.
 * It covers the game canvas, so menu clicks never request pointer lock.
 */
export default class WebMenuOverlay implements MenuOverlay {
    private readonly canvas: HTMLCanvasElement;

    private readonly overlay: HTMLCanvasElement;

    private readonly ctx: CanvasRenderingContext2D;

    private readonly input: MenuOverlayInput;

    private view: MenuView | null = null;

    // Where each item was last drawn, for hit-testing
    private itemRects: MenuItemRects[] = [];

    // Hover is only reported when it moves to another item
    private hovered = -1;

    // First item on screen when the list is too long to fit, see scrollToSelection
    private firstVisible = 0;

    private lastTitle = '';

    constructor(canvas: HTMLCanvasElement, input: MenuOverlayInput) {
        this.canvas = canvas;
        this.input = input;
        // Covers the game canvas inside its container, so fullscreen takes it along
        this.overlay = document.createElement('canvas');
        this.overlay.style.position = 'absolute';
        this.overlay.style.left = '0';
        this.overlay.style.top = '0';
        this.overlay.style.width = '100%';
        this.overlay.style.height = '100%';
        this.overlay.style.zIndex = '900'; // Below the debug HUD
        this.overlay.style.display = 'none';
        (canvas.parentElement ?? document.body).appendChild(this.overlay);

        const ctx = this.overlay.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to create 2D context for menu overlay');
        }
        this.ctx = ctx;

        window.addEventListener('resize', () => this.draw());

        this.overlay.addEventListener('mousemove', (e) => {
            const hit = this.hitTest(e);
            const index = hit ? hit.index : -1;
            if (index === this.hovered) return;
            this.hovered = index;
            if (hit) this.input.pointer({ index: hit.index, clicked: false });
        });
        this.overlay.addEventListener('mouseleave', () => {
            this.hovered = -1;
        });
        this.overlay.addEventListener('click', (e) => {
            const hit = this.hitTest(e);
            if (!hit) return;
            // An arrow steps the value, anywhere else on the row chooses it
            this.input.pointer({ index: hit.index, clicked: !hit.step, step: hit.step });
        });
        this.overlay.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.input.back();
        });
    }

    public render(view: MenuView | null): void {
        this.view = view;
        // The cursor belongs to the menu while it's open
        if (view && document.pointerLockElement) {
            document.exitPointerLock();
        }
        this.draw();
    }

    private hitTest(e: MouseEvent) {
        const { x, y } = toBufferCoords(
            e.clientX,
            e.clientY,
            this.overlay.getBoundingClientRect(),
            this.overlay.width,
            this.overlay.height,
        );
        return hitTestMenu(this.itemRects, x, y);
    }

    // Same drawing size as the game canvas, so render scale applies to the menu too
    private fitToCanvas(): void {
        if (this.overlay.width !== this.canvas.width) this.overlay.width = this.canvas.width;
        if (this.overlay.height !== this.canvas.height) this.overlay.height = this.canvas.height;
    }

    private draw(): void {
        const { view, ctx, overlay } = this;
        if (!view) {
            overlay.style.display = 'none';
            this.itemRects = [];
            this.hovered = -1;
            return;
        }

        overlay.style.display = 'block';
        this.fitToCanvas();

        // Dim the frozen world behind the menu
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, overlay.width, overlay.height);

        const fontSize = Math.round(BASE_FONT_SIZE * view.textScale);
        const lineHeight = Math.round(fontSize * 1.6);
        // Rows and arrows get a little extra room so they're easy to hit
        const rowPadding = Math.round((lineHeight - fontSize) / 2);
        const arrowPadding = Math.round(fontSize / 2);
        const x = Math.round(overlay.width * 0.1);
        const top = Math.round(overlay.height * 0.08);
        let y = top;

        // Rows that fit under the title, leaving a line at the bottom for the scroll marker
        const rowsThatFit = Math.max(1, Math.floor((overlay.height - top - lineHeight * 3) / lineHeight));
        const visibleRows = Math.min(rowsThatFit, view.items.length);
        if (view.title !== this.lastTitle) {
            this.lastTitle = view.title;
            this.firstVisible = 0;
        }
        this.firstVisible = scrollToSelection(this.firstVisible, view.selected, visibleRows, view.items.length);
        const lastVisible = this.firstVisible + visibleRows - 1;

        ctx.textBaseline = 'top';
        ctx.font = `bold ${Math.round(fontSize * 1.5)}px monospace`;
        ctx.fillStyle = 'white';
        ctx.fillText(view.title, x, y);
        y += lineHeight * 2;

        ctx.font = `${fontSize}px monospace`;
        if (this.firstVisible > 0) {
            ctx.fillStyle = '#bbbbbb';
            ctx.fillText('  ...', x, y - lineHeight * 0.75);
        }

        // Hidden rows get an empty rect, so indexes still match the view's items
        const rects: MenuItemRects[] = [];
        for (let i = 0; i < view.items.length; i += 1) {
            if (i < this.firstVisible || i > lastVisible) {
                rects.push({
                    row: {
                        x: 0, y: 0, width: 0, height: 0,
                    },
                });
                // eslint-disable-next-line no-continue
                continue;
            }
            const item = view.items[i];
            const isSelected = i === view.selected;
            const label = `${isSelected ? '> ' : '  '}${item.label}`;
            let text = label;

            // The whole line is a target, not just the text
            const itemRects: MenuItemRects = {
                row: {
                    x: 0, y: y - rowPadding, width: overlay.width, height: lineHeight,
                },
            };

            if (item.value !== undefined) {
                const beforeValue = `${label}   `;
                if (item.adjustable) {
                    const valuePart = `< ${item.value} >`;
                    const arrowWidth = ctx.measureText('<').width;
                    const leftX = x + ctx.measureText(beforeValue).width;
                    const rightX = x + ctx.measureText(`${beforeValue}< ${item.value} `).width;
                    itemRects.decrease = {
                        x: leftX - arrowPadding, y: y - rowPadding, width: arrowWidth + arrowPadding * 2, height: lineHeight,
                    };
                    itemRects.increase = {
                        x: rightX - arrowPadding, y: y - rowPadding, width: arrowWidth + arrowPadding * 2, height: lineHeight,
                    };
                    text = `${beforeValue}${valuePart}`;
                } else {
                    text = `${beforeValue}${item.value}`;
                }
            }

            if (item.disabled) {
                ctx.fillStyle = '#666666';
            } else {
                ctx.fillStyle = isSelected ? 'white' : '#bbbbbb';
            }
            ctx.fillText(text, x, y);
            rects.push(itemRects);
            y += lineHeight;
        }
        if (lastVisible < view.items.length - 1) {
            ctx.fillStyle = '#bbbbbb';
            ctx.fillText('  ...', x, y);
        }
        this.itemRects = rects;
    }
}
