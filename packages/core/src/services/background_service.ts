export interface BackgroundService {
    name: string;
    start(): Promise<void>;
    stop(): Promise<void>;
}
