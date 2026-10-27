// @vitest-environment node
import { createHash } from "node:crypto";
import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";
import { ssoAccess } from "../../src/auth/sso/access";
import { OIDC_DEFAULTS, ssoConfig } from "../../src/auth/sso/config";
import {
	authorizationUrl,
	decodePending,
	encodePending,
	newPendingLogin,
} from "../../src/auth/sso/flow";
import { resolveSsoUser } from "../../src/auth/sso/users";

const CLIENT = { OIDC_CLIENT_ID: "client", OIDC_CLIENT_SECRET: "secret" };

describe("ssoConfig", () => {
	it("is off without a client id and secret", () => {
		expect(ssoConfig({})).toBeNull();
		expect(ssoConfig({ OIDC_CLIENT_ID: "client" })).toBeNull();
	});

	it("defaults to Overbrand's Logto, endpoints under its issuer", () => {
		expect(ssoConfig(CLIENT)).toEqual({
			issuer: "https://auth.overbrand.net/oidc",
			authorizationEndpoint: "https://auth.overbrand.net/oidc/auth",
			tokenEndpoint: "https://auth.overbrand.net/oidc/token",
			userinfoEndpoint: "https://auth.overbrand.net/oidc/me",
			jwksUri: "https://auth.overbrand.net/oidc/jwks",
			clientId: "client",
			clientSecret: "secret",
			requiredRole: "bunSellemAdmin",
			scopes: OIDC_DEFAULTS.scopes,
			label: "Overbrand",
			icon: "/sso/overbrand.png",
		});
	});

	it("takes every value from OIDC_* when set", () => {
		const config = ssoConfig({
			...CLIENT,
			OIDC_ISSUER: "https://id.example.com/oidc/",
			OIDC_TOKEN_ENDPOINT: "https://id.example.com/token",
			OIDC_REQUIRED_ROLE: "ops",
			OIDC_LABEL: "Example",
		});
		expect(config).toMatchObject({
			issuer: "https://id.example.com/oidc",
			authorizationEndpoint: "https://id.example.com/oidc/auth",
			tokenEndpoint: "https://id.example.com/token",
			requiredRole: "ops",
			label: "Example",
		});
	});
});

describe("ssoAccess", () => {
	const role = "bunSellemAdmin";

	it("requires the role at the identity provider", () => {
		expect(ssoAccess({ sub: "u1", roles: ["viewer"] }, role)).toEqual({
			allowed: false,
			reason: "missing_role",
		});
		expect(ssoAccess({ sub: "u1" }, role)).toMatchObject({ allowed: false });
	});

	it("needs a subject", () => {
		expect(ssoAccess({ roles: [role] }, role)).toEqual({
			allowed: false,
			reason: "no_subject",
		});
	});

	it("keeps the address only when the provider vouches for it", () => {
		expect(
			ssoAccess(
				{
					sub: "u1",
					roles: [role],
					email: " Ops@Example.com ",
					email_verified: true,
				},
				role,
			),
		).toEqual({ allowed: true, subject: "u1", email: "ops@example.com" });
		expect(
			ssoAccess({ sub: "u1", roles: [{ name: role }], email: "a@b.c" }, role),
		).toEqual({ allowed: true, subject: "u1", email: null });
	});
});

describe("the sign-in redirect", () => {
	it("carries PKCE (S256), the state and the nonce", () => {
		const config = ssoConfig(CLIENT);
		if (!config) throw new Error("config");
		const pending = newPendingLogin();
		const url = new URL(
			authorizationUrl(config, pending, "https://api.example.com/cb"),
		);
		expect(url.origin + url.pathname).toBe(
			"https://auth.overbrand.net/oidc/auth",
		);
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			client_id: "client",
			response_type: "code",
			redirect_uri: "https://api.example.com/cb",
			state: pending.state,
			nonce: pending.nonce,
			code_challenge_method: "S256",
			code_challenge: createHash("sha256")
				.update(pending.codeVerifier)
				.digest("base64url"),
		});
	});

	it("round-trips the login in flight, and rejects anything else", () => {
		const pending = newPendingLogin();
		expect(decodePending(encodePending(pending))).toEqual(pending);
		expect(decodePending("not-json")).toBeNull();
		expect(decodePending(undefined)).toBeNull();
	});
});

function fakePayload(users: Record<string, unknown>[]) {
	const update = vi.fn(async ({ id, data }) => ({
		...users.find((user) => user.id === id),
		...data,
	}));
	const find = vi.fn(async ({ where }) => {
		const bySubject =
			where.and?.[1]?.["authProviders.providerAccountId"]?.equals;
		const byEmail = where.email?.equals;
		const docs = users.filter((user) =>
			bySubject
				? (
						user.authProviders as { providerAccountId: string }[] | undefined
					)?.some((link) => link.providerAccountId === bySubject)
				: user.email === byEmail,
		);
		return { docs };
	});
	return { payload: { find, update } as unknown as Payload, update };
}

describe("resolveSsoUser", () => {
	const admin = { id: "a1", email: "ops@example.com", role: "admin" };

	it("links an existing administrator found by the vouched-for address", async () => {
		const { payload, update } = fakePayload([admin]);
		await resolveSsoUser(payload, { subject: "u1", email: "ops@example.com" });
		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "a1",
				data: {
					authProviders: [{ provider: "oidc", providerAccountId: "u1" }],
				},
			}),
		);
	});

	it("never creates an account, nor opens one that is not an administrator", async () => {
		await expect(
			resolveSsoUser(fakePayload([]).payload, {
				subject: "u1",
				email: "x@y.z",
			}),
		).rejects.toThrow("no_account");
		await expect(
			resolveSsoUser(fakePayload([{ ...admin, role: "moderator" }]).payload, {
				subject: "u1",
				email: "ops@example.com",
			}),
		).rejects.toThrow("not_an_admin");
		await expect(
			resolveSsoUser(fakePayload([admin]).payload, {
				subject: "u1",
				email: null,
			}),
		).rejects.toThrow("no_verified_email");
	});

	it("finds a linked account by its identity, and refuses it once demoted", async () => {
		const linked = {
			...admin,
			authProviders: [{ provider: "oidc", providerAccountId: "u1" }],
		};
		expect(
			await resolveSsoUser(fakePayload([linked]).payload, {
				subject: "u1",
				email: null,
			}),
		).toMatchObject({ id: "a1" });
		await expect(
			resolveSsoUser(fakePayload([{ ...linked, role: "user" }]).payload, {
				subject: "u1",
				email: null,
			}),
		).rejects.toThrow("not_an_admin");
	});
});
