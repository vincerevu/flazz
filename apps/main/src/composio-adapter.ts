export interface ComposioAdapter {
    isConfigured(): { configured: boolean };
    setApiKey(apiKey: string): { success: boolean; error?: string };
    listToolkits(): Promise<{
        items: Array<{
            slug: string;
            name: string;
            meta: {
                description: string;
                logo: string;
                tools_count: number;
                triggers_count: number;
            };
            no_auth?: boolean;
            auth_schemes?: string[];
            composio_managed_auth_schemes?: string[];
        }>;
        nextCursor: string | null;
        totalItems: number;
    }>;
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
    listConnected(): Promise<{ toolkits: string[] }>;
    executeAction(actionSlug: string, toolkitSlug: string, input: Record<string, unknown>): Promise<{ success: boolean; data: unknown; error?: string }>;
}
