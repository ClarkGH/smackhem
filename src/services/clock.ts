export interface Clock {
    getTime(): number;
    getDeltaTime(): number;
    update(): void;
}
