// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHAT_MEMBERSHIP_CHANNEL as serviceMembership } from "../../../chat-service/src/membership";
import { CHAT_SYSTEM_CHANNEL as serviceSystem } from "../../../chat-service/src/systemMessages";
import { CHAT_MEMBERSHIP_CHANNEL } from "../../src/hooks/membershipEvents";
import { CHAT_SYSTEM_CHANNEL } from "../../src/hooks/systemMessageEvents";

/**
 * Two processes agree on two channel names by having both strings written
 * twice. P3 shipped `chat:membership` declared independently on each side
 * (final review M12): rename one and eviction stops working with both
 * packages type-clean and every suite green. This file is the guard, for the
 * old channel as well as the new one.
 */
describe("the API and chat-service agree on every Redis channel", () => {
	it("agrees on chat:membership", () => {
		expect(serviceMembership).toBe(CHAT_MEMBERSHIP_CHANNEL);
		expect(CHAT_MEMBERSHIP_CHANNEL).toBe("chat:membership");
	});

	it("agrees on chat:system", () => {
		expect(serviceSystem).toBe(CHAT_SYSTEM_CHANNEL);
		expect(CHAT_SYSTEM_CHANNEL).toBe("chat:system");
	});
});
