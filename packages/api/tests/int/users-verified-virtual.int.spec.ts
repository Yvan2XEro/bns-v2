import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/notificationProvider", () => ({
	isNotificationProviderConfigured: () => true,
	getNotificationProvider: vi.fn(),
}));

const syncNotificationSubscriber = vi.fn();
const triggerNotificationEvent = vi.fn();
vi.mock("../../src/hooks/notificationEvents", () => ({
	syncNotificationSubscriber: (...args: unknown[]) =>
		syncNotificationSubscriber(...args),
	triggerNotificationEvent: (...args: unknown[]) =>
		triggerNotificationEvent(...args),
}));

const { deriveVerified, Users } = await import("../../src/collections/Users");

type Hook = (args: { doc: Record<string, unknown> }) => Record<string, unknown>;
type AfterChangeHook = (args: {
	doc: Record<string, unknown>;
}) => Promise<void>;

describe("users.verified virtual", () => {
	it("is true exactly when the account has a live identity verification", () => {
		expect(
			deriveVerified({ identityVerifiedAt: "2026-10-01T00:00:00.000Z" }),
		).toBe(true);
		expect(deriveVerified({ identityVerifiedAt: null })).toBe(false);
		expect(deriveVerified({})).toBe(false);
	});

	it("ignores a stored legacy tick", () => {
		expect(
			deriveVerified({
				verified: true,
				legacyVerifiedAt: "2026-01-01T00:00:00.000Z",
			}),
		).toBe(false);
	});

	it("is computed on every read, beside phoneVerified", () => {
		const beforeRead = (Users.hooks?.beforeRead ?? []) as Hook[];
		const doc = {
			phoneVerifiedAt: "2026-01-01",
			identityVerifiedAt: "2026-10-01",
			verified: false,
		};
		const result = beforeRead.reduce(
			(d, hook) => hook({ doc: d }),
			doc as Record<string, unknown>,
		);
		expect(result.verified).toBe(true);
		expect(result.phoneVerified).toBe(true);
	});

	it("declares verified as a virtual field, so nothing writes it", () => {
		const verified = (
			Users.fields as { name?: string; virtual?: boolean }[]
		).find((f) => f.name === "verified");
		expect(verified?.virtual).toBe(true);
	});

	it("syncs the notification subscriber but never triggers a workflow event — the retired user-verified push is gone, not renamed", async () => {
		const hook = Users.hooks?.afterChange?.[0] as AfterChangeHook;
		await hook({
			doc: { id: "u-1", email: "aicha@example.com", name: "Aïcha" },
		});

		expect(syncNotificationSubscriber).toHaveBeenCalledWith(
			expect.objectContaining({
				subscriberId: "u-1",
				email: "aicha@example.com",
			}),
		);
		expect(triggerNotificationEvent).not.toHaveBeenCalled();
	});
});
