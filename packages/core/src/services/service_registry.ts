import type { BackgroundService } from "./background_service.js";

export class ServiceRegistry {
    private services: BackgroundService[] = [];
    private failedServices: Set<string> = new Set();

    register(service: BackgroundService): void {
        this.services.push(service);
    }

    async startAll(): Promise<void> {
        console.log(`[ServiceRegistry] Starting ${this.services.length} services...`);
        // Start services concurrently
        const startPromises = this.services.map(async (service) => {
            try {
                console.log(`[ServiceRegistry] Starting service: ${service.name}`);
                await service.start();
                console.log(`[ServiceRegistry] Service started: ${service.name}`);
            } catch (error) {
                console.error(`[ServiceRegistry] Error starting service ${service.name}:`, error);
                this.failedServices.add(service.name);
                // Don't throw - allow other services to start
            }
        });

        await Promise.allSettled(startPromises);
        
        if (this.failedServices.size > 0) {
            console.warn(`[ServiceRegistry] ${this.failedServices.size} service(s) failed to start:`, Array.from(this.failedServices));
        }
        console.log(`[ServiceRegistry] All services start requested.`);
    }

    async stopAll(): Promise<void> {
        console.log(`[ServiceRegistry] Stopping ${this.services.length} services...`);
        // Stop services in reverse order or concurrently. We'll do concurrently.
        const stopPromises = this.services.map(async (service) => {
            try {
                console.log(`[ServiceRegistry] Stopping service: ${service.name}`);
                await service.stop();
                console.log(`[ServiceRegistry] Service stopped: ${service.name}`);
            } catch (error) {
                console.error(`[ServiceRegistry] Error stopping service ${service.name}:`, error);
            }
        });

        await Promise.allSettled(stopPromises);
        console.log(`[ServiceRegistry] All services stopped.`);
    }

    isServiceRunning(serviceName: string): boolean {
        return !this.failedServices.has(serviceName);
    }
}
