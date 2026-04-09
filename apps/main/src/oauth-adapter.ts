export interface OAuthAdapter {
    startFlow(provider: string, clientId?: string): Promise<{ success: boolean; error?: string }>;
    disconnect(provider: string): Promise<{ success: boolean }>;
    getAccessToken(provider: string): Promise<string | null>;
    listProviders(): { providers: string[] };
}
