// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	whatsappChatUrl,
	whatsappNumber,
	whatsappShareUrl,
} from "../../src/contracts/whatsapp";

describe("whatsapp links", () => {
	it("dials a number written any usual way", () => {
		expect(whatsappNumber("+237 6 99 00 11 22")).toBe("237699001122");
		expect(whatsappNumber("00237699001122")).toBe("237699001122");
		expect(whatsappNumber("699 00 11 22")).toBe("237699001122");
		expect(whatsappNumber("123")).toBeNull();
	});

	it("prefills the message", () => {
		expect(whatsappChatUrl("+237699001122", "Bonjour ?")).toBe(
			"https://wa.me/237699001122?text=Bonjour%20%3F",
		);
		expect(whatsappChatUrl("+237699001122")).toBe("https://wa.me/237699001122");
		expect(whatsappChatUrl("12")).toBeNull();
		expect(whatsappShareUrl("a b")).toBe("https://wa.me/?text=a%20b");
	});
});
