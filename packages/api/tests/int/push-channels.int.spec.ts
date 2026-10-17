// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	PUSH_CHANNELS,
	pushChannelFor,
} from "../../src/contracts/pushChannels";

describe("pushChannelFor", () => {
	it("sends what waits for the shop's answer on the orders channel", () => {
		expect(pushChannelFor("order-placed", "shop")).toBe(PUSH_CHANNELS.orders);
		expect(pushChannelFor("order-confirmation-needed", undefined)).toBe(
			PUSH_CHANNELS.orders,
		);
		expect(pushChannelFor("order-accept-reminder", undefined)).toBe(
			PUSH_CHANNELS.orders,
		);
	});

	it("keeps the buyer's copy and everything else on the default channel", () => {
		expect(pushChannelFor("order-placed", "buyer")).toBe(PUSH_CHANNELS.default);
		expect(pushChannelFor("message-received", undefined)).toBe(
			PUSH_CHANNELS.default,
		);
	});
});
