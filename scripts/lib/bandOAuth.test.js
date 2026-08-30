import { describe, expect, it, vi } from "vitest";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  parseAuthorizationCallback,
  requireBandOAuthEnv,
} from "./bandOAuth";

describe("BAND OAuth configuration", () => {
  it("requires the client id and client secret without echoing their values", () => {
    expect(() => requireBandOAuthEnv({ BAND_CLIENT_ID: "client-secret-value" })).toThrow(
      "Missing BAND OAuth env vars: BAND_CLIENT_SECRET",
    );
  });

  it("uses localhost callback by default", () => {
    expect(requireBandOAuthEnv({ BAND_CLIENT_ID: "id", BAND_CLIENT_SECRET: "secret" })).toEqual({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "http://localhost:8080/band/callback",
    });
  });
});

describe("BAND authorization request", () => {
  it("builds a real BAND login URL with an exact callback and CSRF state", () => {
    const url = new URL(buildAuthorizationUrl({
      clientId: "client id",
      redirectUri: "http://localhost:8080/band/callback",
      state: "random-state",
    }));
    expect(`${url.origin}${url.pathname}`).toBe("https://auth.band.us/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client id",
      redirect_uri: "http://localhost:8080/band/callback",
      state: "random-state",
    });
  });

  it("accepts a matching callback and rejects a forged state", () => {
    expect(parseAuthorizationCallback("/band/callback?code=abc&state=good", "good")).toBe("abc");
    expect(() => parseAuthorizationCallback("/band/callback?code=abc&state=bad", "good")).toThrow(/state/);
  });

  it("surfaces an OAuth denial from the callback", () => {
    expect(() => parseAuthorizationCallback("/band/callback?error=access_denied&state=good", "good")).toThrow(
      "BAND authorization failed: access_denied",
    );
  });
});

describe("BAND token exchange", () => {
  it("sends the client secret in a form-encoded POST body, never the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "issued-token", expires_in: 3600 }),
    });
    await expect(exchangeAuthorizationCode({
      code: "auth-code",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:8080/band/callback",
      fetchImpl,
    })).resolves.toEqual({ accessToken: "issued-token", expiresIn: 3600 });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://auth.band.us/oauth2/token");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" });
    expect(options.body.toString()).toBe(
      "grant_type=authorization_code&code=auth-code&client_id=client-id&client_secret=client-secret&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fband%2Fcallback",
    );
  });

  it("rejects a successful HTTP response without an access token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result_code: 0 }) });
    await expect(exchangeAuthorizationCode({
      code: "code",
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "http://localhost:8080/band/callback",
      fetchImpl,
    })).rejects.toThrow(/access token/);
  });
});
