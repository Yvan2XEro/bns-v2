// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendSms = vi.fn();
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));

import { formatXaf } from "../../src/lib/orderFormat";
import {
	confirmationCodeSms,
	gsm7Length,
	handoverCodeSms,
	isGsm7,
	receiptSms,
	sellerNewOrderSms,
	sendOrderSms,
} from "../../src/services/orders/sms";

const ORDER_NUMBER = "BNS-2609-000123";
// A real Mongo ObjectId: the tracking link carries the id, and its 24
// characters are what the GSM-7 budget below has to absorb.
const ORDER_ID = "66f1a2b3c4d5e6f708192a3b";
const HANDOVER_CODE = "4821";
const CONFIRMATION_CODE = "482913";
const TOTAL = 47000;

beforeEach(() => {
	sendSms.mockReset();
});

describe("the four order SMS", () => {
	it("fits the receipt SMS in one GSM-7 message", () => {
		for (const locale of ["fr", "en"] as const) {
			const text = receiptSms(
				{
					orderId: ORDER_ID,
					orderNumber: ORDER_NUMBER,
					shopName: "Boutique Mimi",
					total: TOTAL,
				},
				locale,
			);
			expect(gsm7Length(text)).toBeLessThanOrEqual(160);
		}
	});

	// The web page and the API resolve an order only by id: a link carrying
	// the BNS- number answered order.notFound on every receipt.
	it("links the receipt to /purchases/{id}, the page that resolves", () => {
		for (const locale of ["fr", "en"] as const) {
			const text = receiptSms(
				{
					orderId: ORDER_ID,
					orderNumber: ORDER_NUMBER,
					shopName: "Boutique Mimi",
					total: TOTAL,
				},
				locale,
			);
			const link = text.match(/buynsellem\.com\/purchases\/([^\s.]+)/)?.[1];
			expect(link).toBe(ORDER_ID);
			expect(text).toContain(ORDER_NUMBER);
		}
	});

	it("prints a short shop name whole", () => {
		for (const locale of ["fr", "en"] as const) {
			const text = receiptSms(
				{
					orderId: ORDER_ID,
					orderNumber: ORDER_NUMBER,
					shopName: "Mimi",
					total: TOTAL,
				},
				locale,
			);
			expect(text).toContain(" Mimi,");
		}
	});

	it("trims a long shop name, never the link, to stay in one part", () => {
		for (const locale of ["fr", "en"] as const) {
			const text = receiptSms(
				{
					orderId: ORDER_ID,
					orderNumber: ORDER_NUMBER,
					shopName: "Boutique Mama Ngono",
					total: 1_250_000,
				},
				locale,
			);
			expect(gsm7Length(text)).toBeLessThanOrEqual(160);
			expect(text).not.toContain("Boutique Mama Ngono");
			expect(text).toContain(`buynsellem.com/purchases/${ORDER_ID}`);
		}
		// fr carries 8 more characters of fixed text than en, so the name
		// gives way there first and further.
		const fr = receiptSms(
			{
				orderId: ORDER_ID,
				orderNumber: ORDER_NUMBER,
				shopName: "Boutique Mama Ngono",
				total: 1_250_000,
			},
			"fr",
		);
		expect(fr).toContain(" chez Boutiqu.,");
	});

	// The re-review of the final fix round found both of these reachable with
	// ordinary Cameroonian shop names: ô/ê/ç made gsm7Length throw inside the
	// post-commit callback — the receipt was silently never sent for every
	// order that shop ever received — and the trim counted characters while
	// an extended char ([ ] { } € ~) costs two septets, so such a name
	// stayed over budget after "trimming".
	it("sends a receipt for a shop name GSM-7 cannot spell, as its closest spelling", () => {
		for (const locale of ["fr", "en"] as const) {
			const text = receiptSms(
				{
					orderId: ORDER_ID,
					orderNumber: ORDER_NUMBER,
					shopName: "Dépôt Çà ç",
					total: 12_500,
				},
				locale,
			);
			expect(gsm7Length(text)).toBeLessThanOrEqual(160);
			// é and upper-case Ç survive (GSM-7 holds them); ô and the
			// lower-case ç lose their accents; nothing throws, the link is
			// whole, and the name was short enough that nothing was trimmed.
			expect(text).toContain(" Dépot Çà c,");
			expect(text).toContain(`buynsellem.com/purchases/${ORDER_ID}`);
		}
	});

	it("trims a name of two-septet characters by its real GSM-7 cost", () => {
		const text = receiptSms(
			{
				orderId: ORDER_ID,
				orderNumber: ORDER_NUMBER,
				shopName: "Ab[]{}|~^\\x boutique du carrefour",
				total: 1_250_000,
			},
			"fr",
		);
		expect(gsm7Length(text)).toBeLessThanOrEqual(160);
		expect(text).toContain(`buynsellem.com/purchases/${ORDER_ID}`);
	});

	it("fits the confirmation and handover SMS in one message", () => {
		for (const locale of ["fr", "en"] as const) {
			const confirmation = confirmationCodeSms(
				{ orderNumber: ORDER_NUMBER, code: CONFIRMATION_CODE },
				locale,
			);
			const handover = handoverCodeSms(
				{ orderNumber: ORDER_NUMBER, code: HANDOVER_CODE, total: TOTAL },
				locale,
			);
			expect(gsm7Length(confirmation)).toBeLessThanOrEqual(160);
			expect(gsm7Length(handover)).toBeLessThanOrEqual(160);
			// A message that truncates mid-code is useless: the code must survive whole.
			expect(confirmation).toContain(CONFIRMATION_CODE);
			expect(handover).toContain(HANDOVER_CODE);
		}
	});

	it("never puts the handover code in the receipt SMS", () => {
		for (const locale of ["fr", "en"] as const) {
			const text = receiptSms(
				{
					orderId: ORDER_ID,
					orderNumber: ORDER_NUMBER,
					shopName: "Boutique Mimi",
					total: TOTAL,
				},
				locale,
			);
			expect(text).not.toContain(HANDOVER_CODE);
		}
	});

	it("never puts a code in the seller's SMS", () => {
		for (const locale of ["fr", "en"] as const) {
			const text = sellerNewOrderSms(
				{ orderNumber: ORDER_NUMBER, total: TOTAL },
				locale,
			);
			expect(text).not.toContain(HANDOVER_CODE);
			expect(text).not.toContain(CONFIRMATION_CODE);
		}
	});

	// Not `formatXaf` itself: it groups thousands with U+202F, which GSM-7
	// cannot encode, so asserting its exact output here would pin the very
	// format that pushed these messages into UCS-2 at 70 characters a part.
	// The digits and the currency are what the buyer needs; the separator is
	// typography.
	it("writes the amount the buyer must have ready, GSM-7 encodable", () => {
		for (const locale of ["fr", "en"] as const) {
			const text = handoverCodeSms(
				{ orderNumber: ORDER_NUMBER, code: HANDOVER_CODE, total: TOTAL },
				locale,
			);
			expect(isGsm7(text)).toBe(true);
			const plain = formatXaf(TOTAL, locale).replace(/[\u202f\u00a0]/g, " ");
			expect(text).toContain(plain);
		}
	});

	it("refuses to measure a message GSM-7 cannot carry", () => {
		// The guard that makes every length assertion above mean something: it
		// was absent, so a narrow no-break space counted as one ordinary
		// character and the receipt measured 152 while really being three SMS.
		expect(() => gsm7Length("total 1\u202f250\u202f000 FCFA")).toThrow(
			/not GSM-7 encodable/,
		);
		expect(() => gsm7Length("Boutique Mama Ngono")).not.toThrow();
	});

	it("writes in the order's locale", () => {
		const frenchWords = [
			"commande",
			"livraison",
			"montant",
			"nouvelle",
			"votre",
		];
		const en = [
			receiptSms(
				{
					orderId: ORDER_ID,
					orderNumber: ORDER_NUMBER,
					shopName: "Boutique Mimi",
					total: TOTAL,
				},
				"en",
			),
			confirmationCodeSms(
				{ orderNumber: ORDER_NUMBER, code: CONFIRMATION_CODE },
				"en",
			),
			handoverCodeSms(
				{ orderNumber: ORDER_NUMBER, code: HANDOVER_CODE, total: TOTAL },
				"en",
			),
			sellerNewOrderSms({ orderNumber: ORDER_NUMBER, total: TOTAL }, "en"),
		];
		for (const text of en) {
			const lower = text.toLowerCase();
			for (const word of frenchWords) {
				expect(lower).not.toContain(word);
			}
		}
	});

	it("tells the buyer to give the code only at the door", () => {
		const fr = handoverCodeSms(
			{ orderNumber: ORDER_NUMBER, code: HANDOVER_CODE, total: TOTAL },
			"fr",
		);
		const en = handoverCodeSms(
			{ orderNumber: ORDER_NUMBER, code: HANDOVER_CODE, total: TOTAL },
			"en",
		);
		expect(fr).toContain("uniquement a la remise du colis");
		expect(en).toContain("only when you receive the parcel");
	});
});

describe("sendOrderSms", () => {
	it("reports not sent rather than throwing when the provider fails", async () => {
		sendSms.mockRejectedValue(new Error("provider down"));
		const payload = {
			logger: { error: vi.fn() },
		} as unknown as import("payload").Payload;
		const result = await sendOrderSms(payload, {
			to: "+237600000001",
			text: "hello",
		});
		expect(result).toEqual({ sent: false });
		expect(payload.logger.error).toHaveBeenCalled();
	});

	it("reports sent when the provider succeeds", async () => {
		sendSms.mockResolvedValue(undefined);
		const payload = {
			logger: { error: vi.fn() },
		} as unknown as import("payload").Payload;
		const result = await sendOrderSms(payload, {
			to: "+237600000001",
			text: "hello",
		});
		expect(result).toEqual({ sent: true });
	});
});
