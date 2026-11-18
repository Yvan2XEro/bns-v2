// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// `@payloadcms/ui` ships its own stylesheets that this environment cannot
// load, and its `toast` calls a global notification host that does not exist
// in a bare render — both are the library's own plumbing, not something
// these tests are about, so they are replaced with minimal stand-ins.
vi.mock("@payloadcms/ui", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
	Button: (props: { children?: React.ReactNode; onClick?: () => void }) =>
		createElement(
			"button",
			{ type: "button", onClick: props.onClick },
			props.children,
		),
	Pill: (props: { children?: React.ReactNode }) =>
		createElement("span", null, props.children),
	ShimmerEffect: () => createElement("div", null, "loading"),
}));
vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh: vi.fn() }),
}));

const { UserActions } = await import("../../src/components/views/UserActions");
const { default: ModerationWidget } = await import(
	"../../src/components/widgets/ModerationWidget"
);
const { UserManagementClient } = await import(
	"../../src/components/views/UserManagementClient"
);

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("ModerationWidget", () => {
	it("reads the verification queue's pending count from the summary endpoint, not the retired verified filter", async () => {
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/api/listings")) {
				return Promise.resolve({
					json: () => Promise.resolve({ totalDocs: 2 }),
				} as Response);
			}
			if (url.includes("/api/reports")) {
				return Promise.resolve({
					json: () => Promise.resolve({ totalDocs: 1 }),
				} as Response);
			}
			if (url.includes("/api/moderation/summary")) {
				return Promise.resolve({
					json: () => Promise.resolve({ pendingVerifications: 4 }),
				} as Response);
			}
			throw new Error(`unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(createElement(ModerationWidget));

		await screen.findByText("Verifications to review");
		expect(screen.getByText("4")).toBeTruthy();
		for (const [input] of fetchMock.mock.calls) {
			expect(String(input)).not.toContain("where[verified]");
		}
	});
});

describe("UserActions", () => {
	it("offers a role change but never a Verify or Unverify control", () => {
		render(createElement(UserActions, { userId: "u-1", role: "user" }));

		expect(screen.queryByText(/verify/i)).toBeNull();
		expect(screen.getByText("Make Moderator")).toBeTruthy();
	});

	it("offers no action at all for an admin", () => {
		const { container } = render(
			createElement(UserActions, { userId: "u-2", role: "admin" }),
		);

		expect(container.querySelector("button")).toBeNull();
	});
});

describe("UserManagementClient", () => {
	it("shows an Identity verified column driven by identityVerifiedAt, not a retired checkbox", async () => {
		const fetchMock = vi.fn(() =>
			Promise.resolve({
				json: () =>
					Promise.resolve({
						docs: [
							{
								id: "u-1",
								name: "Aïcha",
								email: "aicha@example.com",
								role: "user",
								identityVerifiedAt: "2026-09-01T00:00:00.000Z",
								createdAt: "2026-01-01T00:00:00.000Z",
							},
							{
								id: "u-2",
								name: "No ID",
								email: "noid@example.com",
								role: "user",
								identityVerifiedAt: null,
								createdAt: "2026-01-01T00:00:00.000Z",
							},
						],
					}),
			} as Response),
		);
		vi.stubGlobal("fetch", fetchMock);

		render(createElement(UserManagementClient));

		await screen.findByText("Aïcha");
		expect(screen.getByText("Identity verified")).toBeTruthy();
		expect(screen.getAllByText("Yes")).toHaveLength(1);
		expect(screen.getAllByText("No")).toHaveLength(1);
		expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(
			"where[verified]",
		);
	});
});
