import { describe, expect, test } from "bun:test";
import { shopContactChannels } from "./shop-contact";

describe("the shop page's Contacter menu", () => {
	test("offers writing to the shop first, even with no business channel", () => {
		expect(
			shopContactChannels({ whatsapp: null, phone: null, email: null }),
		).toEqual([{ kind: "message" }]);
	});

	test("then WhatsApp and the call, each only when filled", () => {
		const channels = shopContactChannels({
			whatsapp: "+237 6 99 00 11 22",
			phone: "+237 6 77 00 11 22",
			email: null,
		});
		expect(channels.map((c) => c.kind)).toEqual([
			"message",
			"whatsapp",
			"call",
		]);
		expect(channels[1]).toEqual({
			kind: "whatsapp",
			href: "https://wa.me/237699001122",
		});
		expect(channels[2]).toEqual({
			kind: "call",
			href: "tel:+237677001122",
			phone: "+237 6 77 00 11 22",
		});
		expect(
			shopContactChannels({
				whatsapp: null,
				phone: "+237 6 77 00 11 22",
				email: null,
			}).map((c) => c.kind),
		).toEqual(["message", "call"]);
	});
});
