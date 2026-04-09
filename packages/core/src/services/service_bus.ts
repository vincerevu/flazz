import type { ServiceEventType } from "@flazz/shared";

type ServiceEventHandler = (event: ServiceEventType) => Promise<void> | void;

export class ServiceBus {
    private subscribers: ServiceEventHandler[] = [];

    async publish(event: ServiceEventType): Promise<void> {
        const pending = this.subscribers.map(async (handler) => {
            try {
                await handler(event);
            } catch (error) {
                console.error('[ServiceBus] Error in event handler:', error);
                // Don't throw - allow other handlers to run
            }
        });
        await Promise.allSettled(pending);
    }

    async subscribe(handler: ServiceEventHandler): Promise<() => void> {
        this.subscribers.push(handler);
        return () => {
            const idx = this.subscribers.indexOf(handler);
            if (idx >= 0) {
                this.subscribers.splice(idx, 1);
            }
        };
    }
}

export const serviceBus = new ServiceBus();
