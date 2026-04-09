interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string | null;
}

let googleOAuthCredentials: GoogleOAuthCredentials | null = null;

export function getGoogleOAuthCredentials(): GoogleOAuthCredentials | null {
  return googleOAuthCredentials;
}

export function setGoogleOAuthCredentials(clientId: string, clientSecret?: string): void {
  const trimmed = clientId.trim();
  if (!trimmed) {
    return;
  }
  googleOAuthCredentials = {
    clientId: trimmed,
    clientSecret: clientSecret?.trim() || null,
  };
}

export function clearGoogleOAuthCredentials(): void {
  googleOAuthCredentials = null;
}
