import { describe, expect, it } from "vitest";
import { buildExpoPushData } from "../../src/hooks/notificationEvents";
import { WORKFLOWS } from "../../src/scripts/syncNotificationWorkflows";

const ids = WORKFLOWS.map((w) => w.workflowId);

describe("the P3 workflows", () => {
	it("declares all eight", () => {
		for (const id of [
			"shop-invitation",
			"shop-invitation-accepted",
			"shop-invitation-declined",
			"shop-member-removed",
			"shop-member-role-changed",
			"shop-team-paused",
			"shop-inbox-message",
			"shop-conversation-assigned",
		]) {
			expect(ids).toContain(id);
		}
	});

	it("gives each one a payload schema whose required fields the service sends", () => {
		const inbox = WORKFLOWS.find((w) => w.workflowId === "shop-inbox-message");
		expect(inbox?.payloadSchema).toMatchObject({
			required: [
				"shopId",
				"shopName",
				"conversationId",
				"buyerName",
				"messagePreview",
			],
		});
	});

	it("puts shop-invitation on the email channel and the rest on in-app plus push", () => {
		const invitation = WORKFLOWS.find(
			(w) => w.workflowId === "shop-invitation",
		);
		expect(invitation?.steps.map((s) => s.type)).toEqual([
			"email",
			"in_app",
			"push",
		]);
		const inbox = WORKFLOWS.find((w) => w.workflowId === "shop-inbox-message");
		expect(inbox?.steps.map((s) => s.type)).toEqual(["in_app", "push"]);
	});

	it("declares no duplicate workflow ids", () => {
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("buildExpoPushData", () => {
	it("deep-links an inbox message to the shop inbox thread", () => {
		expect(
			buildExpoPushData("shop-inbox-message", {
				conversationId: "c-1",
				shopId: "s-1",
			}),
		).toEqual({
			conversationId: "c-1",
			shopId: "s-1",
			url: "/seller/inbox/c-1",
		});
	});

	it("deep-links an assignment to the same place", () => {
		expect(
			buildExpoPushData("shop-conversation-assigned", {
				conversationId: "c-1",
				shopId: "s-1",
			}),
		).toEqual({
			conversationId: "c-1",
			shopId: "s-1",
			url: "/seller/inbox/c-1",
		});
	});

	it("deep-links the team workflows to the team screen", () => {
		for (const event of [
			"shop-invitation-accepted",
			"shop-invitation-declined",
			"shop-member-role-changed",
			"shop-team-paused",
		]) {
			expect(buildExpoPushData(event, {})).toEqual({ url: "/seller/team" });
		}
	});

	it("sends a removed member to their own shops list, not to a shop they can no longer open", () => {
		expect(buildExpoPushData("shop-member-removed", { shopId: "s-1" })).toEqual(
			{
				url: "/account",
			},
		);
	});

	it("sends an invitation push to the invite page", () => {
		expect(
			buildExpoPushData("shop-invitation", {
				inviteUrl: "https://buynsellem.com/invite/tok",
			}),
		).toEqual({
			url: "/invite/tok",
		});
	});
});
