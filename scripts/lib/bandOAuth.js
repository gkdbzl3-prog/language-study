const DEFAULT_REDIRECT_URI = "http://localhost:8080/band/callback";
const AUTHORIZATION_ENDPOINT = "https://auth.band.us/oauth2/authorize";
const TOKEN_ENDPOINT = "https://auth.band.us/oauth2/token";

export function requireBandOAuthEnv(env) {
  const required = ["BAND_CLIENT_ID", "BAND_CLIENT_SECRET"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing BAND OAuth env vars: ${missing.join(", ")}`);
  return {
    clientId: env.BAND_CLIENT_ID,
    clientSecret: env.BAND_CLIENT_SECRET,
    redirectUri: env.BAND_REDIRECT_URI || DEFAULT_REDIRECT_URI,
  };
}

export function buildAuthorizationUrl({ clientId, redirectUri, state }) {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  return url.toString();
}

export function parseAuthorizationCallback(requestUrl, expectedState) {
  const url = new URL(requestUrl, "http://localhost");
  if (url.searchParams.get("state") !== expectedState) throw new Error("Invalid OAuth state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) throw new Error(`BAND authorization failed: ${oauthError}`);
  const code = url.searchParams.get("code");
  if (!code) throw new Error("BAND callback did not include an authorization code");
  return code;
}

export async function exchangeAuthorizationCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
  fetchImpl = fetch,
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`BAND token exchange failed with HTTP ${response.status}`);
  const result = payload.result_data || payload;
  if (!result.access_token) throw new Error("BAND token response did not include an access token");
  const token = {
    accessToken: result.access_token,
    expiresIn: result.expires_in,
  };
  if (result.refresh_token) token.refreshToken = result.refresh_token;
  return token;
}
