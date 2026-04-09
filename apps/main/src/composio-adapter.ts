export interface ComposioAdapter {
    isConfigured(): { configured: boolean };
    setApiKey(apiKey: string): { success: boolean; error?: string };
    initiateConnection(toolkitSlug: string): Promise<{
        success: boolean;
        redirectUrl?: string;
        connectedAccountId?: string;
        error?: string;
    }>;
    getConnectionStatus(toolkitSlug: string): Promise<{
        isConnected: boolean;
        status?: string;
    }>;
    syncConnection(toolkitSlug: string, connectedAccountId: string): Promise<{ status: string }>;
    disconnect(toolkitSlug: string): Promise<{ success: boolean }>;
    listConnected(): { toolkits: string[] };
    executeAction(actionSlug: string, toolkitSlug: string, input: Record<string, unknown>): Promise<{ success: boolean; data: unknown; error?: string }>;
}
