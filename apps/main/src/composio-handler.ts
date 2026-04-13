import { shell, BrowserWindow } from 'electron';
import { createAuthServer } from './auth-server.js';
import * as composioClient from '@flazz/core/dist/composio/client.js';
import { composioAccountsRepo } from '@flazz/core/dist/composio/repo.js';
import type { LocalConnectedAccount } from '@flazz/core/dist/composio/types.js';
import { CURATED_TOOLKIT_SLUGS, COMPOSIO_DISPLAY_NAMES } from '@flazz/shared';
import { ComposioAdapter } from './composio-adapter.js';

const REDIRECT_URI = 'http://localhost:8081/oauth/callback';

export class DefaultComposioAdapter implements ComposioAdapter {
    private activeFlows = new Map<string, {
        toolkitSlug: string;
        connectedAccountId: string;
        authConfigId: string;
    }>();

    private emitComposioEvent(event: { toolkitSlug: string; success: boolean; error?: string }): void {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
            if (!win.isDestroyed() && win.webContents) {
                win.webContents.send('composio:didConnect', event);
            }
        }
    }

    isConfigured(): { configured: boolean } {
        return { configured: composioClient.isConfigured() };
    }

    setApiKey(apiKey: string): { success: boolean; error?: string } {
        try {
            composioClient.setApiKey(apiKey);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to set API key',
            };
        }
    }

    async listToolkits(): Promise<{
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
    }> {
        const allItems: Awaited<ReturnType<typeof composioClient.listToolkits>>['items'] = [];
        let cursor: string | null = null;

        for (let page = 0; page < 10; page += 1) {
            const result = await composioClient.listToolkits(cursor);
            allItems.push(...result.items);
            cursor = result.next_cursor;
            if (!cursor) {
                break;
            }
        }

        const filtered = allItems
            .filter((item) => CURATED_TOOLKIT_SLUGS.has(item.slug))
            .map((item) => ({
                ...item,
                name: COMPOSIO_DISPLAY_NAMES[item.slug] || item.name,
            }));

        return {
            items: filtered,
            nextCursor: null,
            totalItems: filtered.length,
        };
    }

    async initiateConnection(toolkitSlug: string): Promise<{
        success: boolean;
        redirectUrl?: string;
        connectedAccountId?: string;
        error?: string;
    }> {
        try {
            console.log(`[Composio] Initiating connection for ${toolkitSlug}...`);

            if (composioAccountsRepo.isConnected(toolkitSlug)) {
                return { success: true };
            }

            const toolkit = await composioClient.getToolkit(toolkitSlug);

            if (!toolkit.composio_managed_auth_schemes.includes('OAUTH2')) {
                return {
                    success: false,
                    error: `Toolkit ${toolkitSlug} does not support managed OAuth2`,
                };
            }

            const authConfigs = await composioClient.listAuthConfigs(toolkitSlug, null, true);
            let authConfigId: string;

            const managedOauth2 = authConfigs.items.find(
                cfg => cfg.auth_scheme === 'OAUTH2' && cfg.is_composio_managed
            );

            if (managedOauth2) {
                authConfigId = managedOauth2.id;
            } else {
                const created = await composioClient.createAuthConfig({
                    toolkit: { slug: toolkitSlug },
                    auth_config: {
                        type: 'use_composio_managed_auth',
                        name: `Flazz-${toolkitSlug}`,
                    },
                });
                authConfigId = created.auth_config.id;
            }

            const callbackUrl = REDIRECT_URI;
            const response = await composioClient.createConnectedAccount({
                auth_config: { id: authConfigId },
                connection: {
                    user_id: 'Flazz-user',
                    callback_url: callbackUrl,
                },
            });

            const connectedAccountId = response.id;

            const connectionVal = response.connectionData?.val;
            const redirectUrl = typeof connectionVal === 'object' && connectionVal !== null && 'redirectUrl' in connectionVal
                ? String((connectionVal as Record<string, unknown>).redirectUrl)
                : undefined;

            if (!redirectUrl) {
                return {
                    success: false,
                    error: 'No redirect URL received from Composio',
                };
            }

            const flowKey = `${toolkitSlug}-${Date.now()}`;
            this.activeFlows.set(flowKey, {
                toolkitSlug,
                connectedAccountId,
                authConfigId,
            });

            const account: LocalConnectedAccount = {
                id: connectedAccountId,
                authConfigId,
                status: 'INITIATED',
                toolkitSlug,
                createdAt: new Date().toISOString(),
                lastUpdatedAt: new Date().toISOString(),
            };
            composioAccountsRepo.saveAccount(account);

            let cleanupTimeout: NodeJS.Timeout | undefined = undefined;
            const { server } = await createAuthServer(8081, async () => {
                try {
                    const accountStatus = await composioClient.getConnectedAccount(connectedAccountId);
                    composioAccountsRepo.updateAccountStatus(toolkitSlug, accountStatus.status);

                    if (accountStatus.status === 'ACTIVE') {
                        this.emitComposioEvent({ toolkitSlug, success: true });
                        
                        // Trigger immediate sync for Gmail/Calendar after successful connection
                        if (toolkitSlug === 'gmail') {
                            console.log('[Composio] Gmail connected - triggering immediate sync');
                            const { triggerSync } = await import('@flazz/core/dist/knowledge/sync_gmail_composio.js');
                            triggerSync();
                        } else if (toolkitSlug === 'googlecalendar') {
                            console.log('[Composio] Calendar connected - triggering immediate sync');
                            const { triggerSync } = await import('@flazz/core/dist/knowledge/sync_calendar_composio.js');
                            triggerSync();
                        }
                    } else {
                        this.emitComposioEvent({
                            toolkitSlug,
                            success: false,
                            error: `Connection status: ${accountStatus.status}`,
                        });
                    }
                } catch (error) {
                    console.error('[Composio] Failed to sync account status:', error);
                    this.emitComposioEvent({
                        toolkitSlug,
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                } finally {
                    this.activeFlows.delete(flowKey);
                    server.close();
                    clearTimeout(cleanupTimeout);
                }
            });

            cleanupTimeout = setTimeout(() => {
                if (this.activeFlows.has(flowKey)) {
                    console.log(`[Composio] Cleaning up abandoned flow for ${toolkitSlug}`);
                    this.activeFlows.delete(flowKey);
                    server.close();
                    this.emitComposioEvent({
                        toolkitSlug,
                        success: false,
                        error: 'OAuth flow timed out',
                    });
                }
            }, 5 * 60 * 1000);

            shell.openExternal(redirectUrl);

            return {
                success: true,
                redirectUrl,
                connectedAccountId,
            };
        } catch (error) {
            console.error('[Composio] Connection initiation failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    async getConnectionStatus(toolkitSlug: string): Promise<{
        isConnected: boolean;
        status?: string;
    }> {
        const account = composioAccountsRepo.getAccount(toolkitSlug);
        if (!account) {
            return { isConnected: false };
        }
        return {
            isConnected: account.status === 'ACTIVE',
            status: account.status,
        };
    }

    async syncConnection(
        toolkitSlug: string,
        connectedAccountId: string
    ): Promise<{ status: string }> {
        try {
            const accountStatus = await composioClient.getConnectedAccount(connectedAccountId);
            composioAccountsRepo.updateAccountStatus(toolkitSlug, accountStatus.status);
            return { status: accountStatus.status };
        } catch (error) {
            console.error('[Composio] Failed to sync connection:', error);
            return { status: 'FAILED' };
        }
    }

    async disconnect(toolkitSlug: string): Promise<{ success: boolean }> {
        try {
            const account = composioAccountsRepo.getAccount(toolkitSlug);
            if (account) {
                await composioClient.deleteConnectedAccount(account.id);
                composioAccountsRepo.deleteAccount(toolkitSlug);
            }
            return { success: true };
        } catch (error) {
            console.error('[Composio] Disconnect failed:', error);
            composioAccountsRepo.deleteAccount(toolkitSlug);
            return { success: true };
        }
    }

    listConnected(): { toolkits: string[] } {
        return { toolkits: composioAccountsRepo.getConnectedToolkits() };
    }

    async executeAction(
        actionSlug: string,
        toolkitSlug: string,
        input: Record<string, unknown>
    ): Promise<{ success: boolean; data: unknown; error?: string }> {
        try {
            const account = composioAccountsRepo.getAccount(toolkitSlug);
            if (!account || account.status !== 'ACTIVE') {
                return {
                    success: false,
                    data: null,
                    error: `Toolkit ${toolkitSlug} is not connected`,
                };
            }

            const result = await composioClient.executeAction(actionSlug, account.id, input);
            return result;
        } catch (error) {
            console.error('[Composio] Action execution failed:', error);
            return {
                success: false,
                data: null,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
}

const defaultComposioAdapter = new DefaultComposioAdapter();

export function isConfigured(): { configured: boolean } {
    return defaultComposioAdapter.isConfigured();
}

export function setApiKey(apiKey: string): { success: boolean; error?: string } {
    return defaultComposioAdapter.setApiKey(apiKey);
}

export async function listToolkits(): Promise<{
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
}> {
    return defaultComposioAdapter.listToolkits();
}

export async function initiateConnection(toolkitSlug: string): Promise<{
    success: boolean;
    redirectUrl?: string;
    connectedAccountId?: string;
    error?: string;
}> {
    return defaultComposioAdapter.initiateConnection(toolkitSlug);
}

export async function getConnectionStatus(toolkitSlug: string): Promise<{
    isConnected: boolean;
    status?: string;
}> {
    return defaultComposioAdapter.getConnectionStatus(toolkitSlug);
}

export async function syncConnection(
    toolkitSlug: string,
    connectedAccountId: string
): Promise<{ status: string }> {
    return defaultComposioAdapter.syncConnection(toolkitSlug, connectedAccountId);
}

export async function disconnect(toolkitSlug: string): Promise<{ success: boolean }> {
    return defaultComposioAdapter.disconnect(toolkitSlug);
}

export function listConnected(): { toolkits: string[] } {
    return defaultComposioAdapter.listConnected();
}

export async function executeAction(
    actionSlug: string,
    toolkitSlug: string,
    input: Record<string, unknown>
): Promise<{ success: boolean; data: unknown; error?: string }> {
    return defaultComposioAdapter.executeAction(actionSlug, toolkitSlug, input);
}
