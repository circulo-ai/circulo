export function hasGoogleOAuthCredentials(
  clientId: string | undefined,
  clientSecret: string | undefined,
): boolean {
  return Boolean(clientId?.trim() && clientSecret?.trim());
}

export function getAvailableSocialProviders(
  googleConfigured: boolean,
): "google"[] | [] {
  return googleConfigured ? ["google"] : [];
}
