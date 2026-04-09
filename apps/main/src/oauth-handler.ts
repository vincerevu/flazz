import { shell, BrowserWindow } from 'electron';
import { createAuthServer } from './auth-server.js';
import * as oauthClient from '@flazz/core/dist/auth/oauth-client.js';
import { getProviderConfig, getAvailableProviders } from '@flazz/core/dist/auth/providers.js';
// @ts-ignore
import type { Configuration } from '@panva/oauth4webapi';
import container from '@flazz/core/dist/di/container.js';
import { IOAuthRepo } from '@flazz/core/dist/auth/repo.js';
import { IClientRegistrationRepo } from '@flazz/core/dist/auth/client-repo.js';
import { Server } from 'node:http';
import { triggerSync as triggerGmailSync } from '@flazz/core/dist/knowledge/sync_gmail.js';
import { triggerSync as triggerCalendarSync } from '@flazz/core/dist/knowledge/sync_calendar.js';
import { triggerSync as triggerFirefliesSync } from '@flazz/core/dist/knowledge/sync_fireflies.js';
import { OAuthAdapter } from './oauth-adapter.js';

const REDIRECT_URI = 'http://localhost:8080/oauth/callback';

export class DefaultOAuthAdapter implements OAuthAdapter {
    private activeFlows = new Map<string, {
        codeVerifier: string;
        provider: string;
        config: Configuration;
    }>();

    private activeFlow: {
        provider: string;
        state: string;
        server: Server;
        cleanupTimeout: NodeJS.Timeout;
    } | null = null;

    private emitOAuthEvent(event: { provider: string; success: boolean; error?: string }): void {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
            if (!win.isDestroyed() && win.webContents) {
                win.webContents.send('oauth:didConnect', event);
            }
        }
    }

    private cancelActiveFlow(reason: string = 'cancelled'): void {
        if (!this.activeFlow) {
            return;
        }

        console.log(`[OAuth] Cancelling active flow for ${this.activeFlow.provider}: ${reason}`);

        clearTimeout(this.activeFlow.cleanupTimeout);
        this.activeFlow.server.close();
        this.activeFlows.delete(this.activeFlow.state);

        if (reason !== 'new_flow_started') {
            this.emitOAuthEvent({
                provider: this.activeFlow.provider,
                success: false,
                error: `OAuth flow ${reason}`
            });
        }

        this.activeFlow = null;
    }

    private getOAuthRepo(): IOAuthRepo {
        return container.resolve<IOAuthRepo>('oauthRepo');
    }

    private getClientRegistrationRepo(): IClientRegistrationRepo {
        return container.resolve<IClientRegistrationRepo>('clientRegistrationRepo');
    }

    private async getProviderConfiguration(provider: string, clientIdOverride?: string): Promise<Configuration> {
        const config = getProviderConfig(provider);
        const resolveClientId = async (): Promise<string> => {
            if (config.client.mode === 'static' && config.client.clientId) {
                return config.client.clientId;
            }
            if (clientIdOverride) {
                return clientIdOverride;
            }
            const oauthRepo = this.getOAuthRepo();
            const { clientId } = await oauthRepo.read(provider);
            if (clientId) {
                return clientId;
            }
            throw new Error(`${provider} client ID not configured. Please provide a client ID.`);
        };

        if (config.discovery.mode === 'issuer') {
            if (config.client.mode === 'static') {
                console.log(`[OAuth] ${provider}: Discovery from issuer with static client ID`);
                const clientId = await resolveClientId();
                return await oauthClient.discoverConfiguration(
                    config.discovery.issuer,
                    clientId
                );
            } else {
                console.log(`[OAuth] ${provider}: Discovery from issuer with DCR`);
                const clientRepo = this.getClientRegistrationRepo();
                const existingRegistration = await clientRepo.getClientRegistration(provider);

                if (existingRegistration) {
                    console.log(`[OAuth] ${provider}: Using existing DCR registration`);
                    return await oauthClient.discoverConfiguration(
                        config.discovery.issuer,
                        existingRegistration.client_id
                    );
                }

                const scopes = config.scopes || [];
                const { config: oauthConfig, registration } = await oauthClient.registerClient(
                    config.discovery.issuer,
                    [REDIRECT_URI],
                    scopes
                );

                await clientRepo.saveClientRegistration(provider, registration);
                console.log(`[OAuth] ${provider}: DCR registration saved`);

                return oauthConfig;
            }
        } else {
            if (config.client.mode !== 'static') {
                throw new Error('DCR requires discovery mode "issuer", not "static"');
            }

            console.log(`[OAuth] ${provider}: Using static endpoints (no discovery)`);
            const clientId = await resolveClientId();
            return oauthClient.createStaticConfiguration(
                config.discovery.authorizationEndpoint,
                config.discovery.tokenEndpoint,
                clientId,
                config.discovery.revocationEndpoint
            );
        }
    }

    async startFlow(provider: string, clientId?: string): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(`[OAuth] Starting connection flow for ${provider}...`);

            this.cancelActiveFlow('new_flow_started');

            const oauthRepo = this.getOAuthRepo();
            const providerConfig = getProviderConfig(provider);

            if (provider === 'google') {
                if (!clientId) {
                    return { success: false, error: 'Google client ID is required to connect.' };
                }
            }

            const config = await this.getProviderConfiguration(provider, clientId);

            const { verifier: codeVerifier, challenge: codeChallenge } = await oauthClient.generatePKCE();
            const state = oauthClient.generateState();

            const scopes = providerConfig.scopes || [];

            this.activeFlows.set(state, { codeVerifier, provider, config });

            const authUrl = oauthClient.buildAuthorizationUrl(config, {
                redirect_uri: REDIRECT_URI,
                scope: scopes.join(' '),
                code_challenge: codeChallenge,
                state,
            });

            const { server } = await createAuthServer(8080, async (params: Record<string, string>) => {
                if (params.state !== state) {
                    throw new Error('Invalid state parameter - possible CSRF attack');
                }

                const flow = this.activeFlows.get(state);
                if (!flow || flow.provider !== provider) {
                    throw new Error('Invalid OAuth flow state');
                }

                try {
                    const callbackUrl = new URL(`${REDIRECT_URI}?${new URLSearchParams(params).toString()}`);

                    console.log(`[OAuth] Exchanging authorization code for tokens (${provider})...`);
                    const tokens = await oauthClient.exchangeCodeForTokens(
                        flow.config,
                        callbackUrl,
                        flow.codeVerifier,
                        state
                    );

                    console.log(`[OAuth] Token exchange successful for ${provider}`);
                    await oauthRepo.upsert(provider, { tokens });
                    if (provider === 'google' && clientId) {
                        await oauthRepo.upsert(provider, { clientId });
                    }
                    await oauthRepo.upsert(provider, { error: null });

                    if (provider === 'google') {
                        triggerGmailSync();
                        triggerCalendarSync();
                    } else if (provider === 'fireflies-ai') {
                        triggerFirefliesSync();
                    }

                    this.emitOAuthEvent({ provider, success: true });
                } catch (error) {
                    console.error('OAuth token exchange failed:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    this.emitOAuthEvent({ provider, success: false, error: errorMessage });
                    throw error;
                } finally {
                    this.activeFlows.delete(state);
                    if (this.activeFlow && this.activeFlow.state === state) {
                        clearTimeout(this.activeFlow.cleanupTimeout);
                        this.activeFlow.server.close();
                        this.activeFlow = null;
                    }
                }
            });

            const cleanupTimeout = setTimeout(() => {
                if (this.activeFlow?.state === state) {
                    console.log(`[OAuth] Cleaning up abandoned OAuth flow for ${provider} (timeout)`);
                    this.cancelActiveFlow('timed_out');
                }
            }, 2 * 60 * 1000);

            this.activeFlow = {
                provider,
                state,
                server,
                cleanupTimeout,
            };

            shell.openExternal(authUrl.toString());

            return { success: true };
        } catch (error) {
            console.error('OAuth connection failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    async disconnect(provider: string): Promise<{ success: boolean }> {
        try {
            const oauthRepo = this.getOAuthRepo();
            await oauthRepo.delete(provider);
            return { success: true };
        } catch (error) {
            console.error('OAuth disconnect failed:', error);
            return { success: false };
        }
    }

    async getAccessToken(provider: string): Promise<string | null> {
        try {
            const oauthRepo = this.getOAuthRepo();

            const { tokens } = await oauthRepo.read(provider);
            if (!tokens) {
                return null;
            }

            if (oauthClient.isTokenExpired(tokens)) {
                if (!tokens.refresh_token) {
                    await oauthRepo.upsert(provider, { error: 'Missing refresh token. Please reconnect.' });
                    return null;
                }

                try {
                    const config = await this.getProviderConfiguration(provider);

                    const existingScopes = tokens.scopes;
                    const refreshedTokens = await oauthClient.refreshTokens(config, tokens.refresh_token, existingScopes);
                    await oauthRepo.upsert(provider, { tokens });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Token refresh failed';
                    await oauthRepo.upsert(provider, { error: message });
                    console.error('Token refresh failed:', error);
                    return null;
                }
            }

            return tokens.access_token;
        } catch (error) {
            console.error('Get access token failed:', error);
            return null;
        }
    }

    listProviders(): { providers: string[] } {
        return { providers: getAvailableProviders() };
    }
}

const defaultOAuthAdapter = new DefaultOAuthAdapter();

export async function connectProvider(provider: string, clientId?: string): Promise<{ success: boolean; error?: string }> {
    return defaultOAuthAdapter.startFlow(provider, clientId);
}

export async function disconnectProvider(provider: string): Promise<{ success: boolean }> {
    return defaultOAuthAdapter.disconnect(provider);
}

export async function getAccessToken(provider: string): Promise<string | null> {
    return defaultOAuthAdapter.getAccessToken(provider);
}

export function listProviders(): { providers: string[] } {
    return defaultOAuthAdapter.listProviders();
}
