// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

import { buyerFeeInvoiceFilesDir } from "../../src/collections/BuyerFeeInvoiceFiles";
import {
	BUYER_FEE_DOCUMENT_COPY,
	type BuyerFeeDocument,
	buyerFeeDocumentLines,
} from "../../src/lib/commissionInvoiceDocument";
import { ERROR_CODES } from "../../src/lib/errors";
import { splitAmounts } from "../../src/lib/paymentMath";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
} from "../../src/lib/paymentSettings";
import { verifyLocalFileToken } from "../../src/lib/privateFiles";
import { ServiceError } from "../../src/lib/serviceError";
import { withTransaction } from "../../src/lib/transactions";
import type {
	BuyerFeeInvoice,
	Order,
	PaymentIntent,
} from "../../src/payload-types";
import {
	BUYER_FEE_INVOICE_URL_TTL_SECONDS,
	buyerFeeInvoiceDownload,
	creditNoteFor,
	issueBuyerFeeInvoice,
	issueMissingBuyerFeeInvoices,
} from "../../src/services/buyerFeeInvoices";
import { PLATFORM_ISSUER } from "../../src/services/commission";
import { postingFor, postLedger } from "../../src/services/ledger";
import { nextInvoiceNumber } from "../../src/services/sequences";
import { vatReportCsv } from "../../src/services/vatReport";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const PAID_AT = "2026-10-03T08:00:00.000Z";
const MARKET = DEFAULT_MARKETS[0];
const CURRENCY = MARKET.currency;
const SHOP = "s-1";
const BUYER = "u-buyer";

/** The ledger spec's worked order: G 48 410, D 43 240, C 3 153 + 607, P 1 410 (VAT 228). */
const SPLIT = splitAmounts({
	orderTotal: 47_000,
	commission: 3_153,
	vatRateBps: MARKET.vatRateBps,
	protection: PAYMENT_DEFAULTS.buyerProtection,
});

function orderDoc(id: string, number: string): Doc {
	return {
		id,
		orderNumber: number,
		buyer: BUYER,
		shop: SHOP,
		status: "paid",
		paymentMethod: "mobile_money",
		paymentStatus: "paid",
		delivery: { recipientName: "Awa", phone: "+237670000001" },
		amounts: {
			subtotal: 45_000,
			deliveryFee: 2_000,
			total: SPLIT.buyerTotal,
			currency: CURRENCY,
			buyerProtectionFee: SPLIT.buyerProtectionFee,
			buyerProtectionFeeVat: SPLIT.buyerProtectionFeeVat,
			commission: SPLIT.commission,
			commissionVat: SPLIT.commissionVat,
			applicationFee: SPLIT.applicationFee,
			destinationAmount: SPLIT.destinationAmount,
		},
	};
}

function intentDoc(id: string, orderId: string): Doc {
	return {
		id,
		purpose: "checkout",
		targetType: "order",
		targetId: orderId,
		amount: SPLIT.buyerTotal,
		currency: CURRENCY,
		provider: "notchpay",
		status: "succeeded",
		statusHistory: [
			{ status: "pending", source: "system", at: "2026-10-03T07:55:00.000Z" },
			{ status: "succeeded", source: "webhook", at: PAID_AT },
		],
		createdAt: "2026-10-03T07:55:00.000Z",
		updatedAt: PAID_AT,
	};
}

function world(): FakePayload {
	return fakePayload(
		{
			orders: [
				orderDoc("o-1", "BNS-2610-000001"),
				orderDoc("o-2", "BNS-2610-000002"),
				orderDoc("o-3", "BNS-2612-000003"),
			],
			"payment-intents": [
				intentDoc("pi-1", "o-1"),
				intentDoc("pi-2", "o-2"),
				intentDoc("pi-3", "o-3"),
			],
			shops: [{ id: SHOP, name: "Shop", location: { countryCode: "CM" } }],
			users: [
				{ id: BUYER, role: "user" },
				{ id: "u-owner", role: "user" },
				{ id: "u-stranger", role: "user" },
				{ id: "u-mod", role: "moderator" },
				{ id: "u-admin", role: "admin" },
			],
			sequences: [],
			"buyer-fee-invoices": [],
			"buyer-fee-invoice-files": [],
		},
		{
			uniques: {
				"buyer-fee-invoices": [["number"]],
				sequences: [["key"]],
			},
			globals: {
				"app-settings": {
					payments: { ...PAYMENT_DEFAULTS, markets: DEFAULT_MARKETS },
				},
			},
		},
	);
}

let payload: FakePayload;
const order = (id: string) =>
	payload.store.orders.find((o) => o.id === id) as unknown as Order;
const intent = (id: string) =>
	payload.store["payment-intents"].find(
		(i) => i.id === id,
	) as unknown as PaymentIntent;
const invoices = () =>
	payload.store["buyer-fee-invoices"] as unknown as BuyerFeeInvoice[];

const issue = (orderId: string, intentId: string) =>
	withTransaction(payload, (req) =>
		issueBuyerFeeInvoice(req, order(orderId), intent(intentId)),
	);

/** The text the PDF shows, decoded back from its WinAnsi string operands. */
function pdfText(bytes: Uint8Array): string[] {
	const raw = Buffer.from(bytes).toString("latin1");
	const back: Record<string, string> = { "\x97": "—", "\xa0": " " };
	return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) =>
		m[1].replace(/\\(.)/g, "$1").replace(/[\x97\xa0]/g, (c) => back[c]),
	);
}

const plain = (text: string) => text.replace(/ /g, " ");

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	payload = world();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

describe("the series F template", () => {
	const doc: BuyerFeeDocument = {
		kind: "invoice",
		number: "BNS-F-2026-000001",
		creditsNumber: null,
		issuedAt: NOW.toISOString(),
		paidAt: PAID_AT,
		orderNumber: "BNS-2610-000001",
		customerName: "Awa",
		amountHt: 1_182,
		vat: 228,
		amountTtc: 1_410,
		vatRateBps: 1_925,
		issuer: {
			legalName: "BuyNSellem SARL",
			supportEmail: "support@buynsellem.com",
		},
	};

	it("prints the invoice in accented French, then in English", () => {
		expect(buyerFeeDocumentLines(doc).map((l) => plain(l.text))).toEqual([
			"Facture — frais de protection acheteur",
			"Numéro : BNS-F-2026-000001",
			"Date d'émission : 3 octobre 2026",
			"Émetteur : BuyNSellem SARL",
			"Contact : support@buynsellem.com",
			"Commande : BNS-2610-000001",
			"Client : Awa",
			"Désignation : Service de protection acheteur",
			"Montant HT : 1 182 FCFA",
			"TVA (19,25 %) : 228 FCFA",
			"Montant TTC : 1 410 FCFA",
			"Payée par mobile money le 3 octobre 2026",
			"Invoice — buyer protection fee",
			"Number: BNS-F-2026-000001",
			"Issue date: 3 October 2026",
			"Issuer: BuyNSellem SARL",
			"Contact: support@buynsellem.com",
			"Order: BNS-2610-000001",
			"Customer: Awa",
			"Description: Buyer protection service",
			"Amount excl. VAT: XAF 1,182",
			"VAT (19.25%): XAF 228",
			"Amount incl. VAT: XAF 1,410",
			"Paid by mobile money on 3 October 2026",
		]);
	});

	it("titles a credit note as one and names the invoice it cancels", () => {
		const lines = buyerFeeDocumentLines({
			...doc,
			kind: "credit_note",
			number: "BNS-F-2026-000002",
			creditsNumber: "BNS-F-2026-000001",
			paidAt: null,
		}).map((l) => plain(l.text));
		expect(lines.filter((l) => /Avoir|Credit/.test(l))).toEqual([
			"Avoir — frais de protection acheteur",
			"Avoir sur la facture : BNS-F-2026-000001",
			"Credit note — buyer protection fee",
			"Credits invoice: BNS-F-2026-000001",
		]);
		expect(lines.filter((l) => /rembours|refunded/.test(l))).toEqual([
			BUYER_FEE_DOCUMENT_COPY.fr.refunded,
			BUYER_FEE_DOCUMENT_COPY.en.refunded,
		]);
	});
});

describe("issueBuyerFeeInvoice", () => {
	it("invoices the worked order's fee by exact amounts, with its PDF in private storage", async () => {
		const issued = await issue("o-1", "pi-1");

		expect(invoices()).toHaveLength(1);
		const fileId = String(issued?.pdf);
		expect({
			...invoices()[0],
			id: undefined,
			createdAt: undefined,
			updatedAt: undefined,
		}).toEqual({
			id: undefined,
			createdAt: undefined,
			updatedAt: undefined,
			number: "BNS-F-2026-000001",
			kind: "invoice",
			order: "o-1",
			buyer: BUYER,
			amountHt: 1_182,
			vat: 228,
			amountTtc: 1_410,
			vatRateBps: 1_925,
			pdf: fileId,
			issuedAt: NOW.toISOString(),
		});

		const file = payload.store["buyer-fee-invoice-files"].find(
			(f) => f.id === fileId,
		);
		expect([file?.filename, file?.mimeType]).toEqual([
			"BNS-F-2026-000001.pdf",
			"application/pdf",
		]);
		const bytes = payload.files.get(fileId);
		expect(
			Buffer.from(bytes ?? [])
				.subarray(0, 8)
				.toString("latin1"),
		).toBe("%PDF-1.4");
		expect(file?.filesize).toBe(bytes?.length);
		const text = pdfText(bytes ?? new Uint8Array());
		expect(text).toHaveLength(24);
		expect(text.slice(0, 2)).toEqual([
			"Facture — frais de protection acheteur",
			"Numéro : BNS-F-2026-000001",
		]);
		expect(text).toContain(`Émetteur : ${PLATFORM_ISSUER.legalName}`);
		expect(text).toContain("Montant TTC : 1 410 FCFA");
		expect(text).toContain("Amount incl. VAT: XAF 1,410");
		expect(text).toContain("Payée par mobile money le 3 octobre 2026");
	});

	it("numbers each series per year on the Douala clock, without touching series C", async () => {
		const first = await issue("o-1", "pi-1");
		const commission = await withTransaction(payload, (req) =>
			nextInvoiceNumber(req, "C", new Date()),
		);
		const second = await issue("o-2", "pi-2");
		// 23:30 UTC on 31 December is already 2027 in Douala.
		vi.setSystemTime(new Date("2026-12-31T23:30:00.000Z"));
		const third = await issue("o-3", "pi-3");

		expect([first?.number, commission, second?.number, third?.number]).toEqual([
			"BNS-F-2026-000001",
			"BNS-C-2026-000001",
			"BNS-F-2026-000002",
			"BNS-F-2027-000001",
		]);
	});

	it("is idempotent per order: two replays leave one row and return the same number", async () => {
		const first = await issue("o-1", "pi-1");
		const replay = await issue("o-1", "pi-1");
		const again = await issue("o-1", "pi-1");

		expect(
			invoices().filter((i) => i.order === "o-1" && i.kind === "invoice"),
		).toHaveLength(1);
		expect([first?.number, replay?.number, again?.number]).toEqual([
			"BNS-F-2026-000001",
			"BNS-F-2026-000001",
			"BNS-F-2026-000001",
		]);
		expect(payload.store["buyer-fee-invoice-files"]).toHaveLength(1);
		// No number was burnt by the replays: the next order gets 2.
		expect((await issue("o-2", "pi-2"))?.number).toBe("BNS-F-2026-000002");
	});

	it("rolls the number back with the invoice when the write fails", async () => {
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "buyer-fee-invoices";
		await expect(issue("o-1", "pi-1")).rejects.toThrow(
			"forced failure: create",
		);
		payload.failWhen = null;

		expect(invoices()).toHaveLength(0);
		expect((await issue("o-1", "pi-1"))?.number).toBe("BNS-F-2026-000001");
	});
});

describe("creditNoteFor", () => {
	const fullRefund = {
		id: "rf-1",
		breakdown: {
			seller: SPLIT.destinationAmount,
			commission: SPLIT.commission,
			commissionVat: SPLIT.commissionVat,
			buyerProtectionFee: SPLIT.buyerProtectionFee,
		},
	};

	it("mirrors the refunded fee on a numbered credit note, once", async () => {
		const invoice = await issue("o-1", "pi-1");
		if (!invoice) throw new Error("no invoice");
		const note = await withTransaction(payload, (req) =>
			creditNoteFor(req, invoice, fullRefund),
		);
		const replay = await withTransaction(payload, (req) =>
			creditNoteFor(req, invoice, fullRefund),
		);

		const notes = invoices().filter((i) => i.kind === "credit_note");
		expect(notes).toHaveLength(1);
		expect(replay?.id).toBe(note?.id);
		expect({
			number: notes[0].number,
			creditsInvoice: notes[0].creditsInvoice,
			order: notes[0].order,
			buyer: notes[0].buyer,
			amounts: [notes[0].amountHt, notes[0].vat, notes[0].amountTtc],
			vatRateBps: notes[0].vatRateBps,
		}).toEqual({
			number: "BNS-F-2026-000002",
			creditsInvoice: invoice.id,
			order: "o-1",
			buyer: BUYER,
			amounts: [1_182, 228, 1_410],
			vatRateBps: 1_925,
		});
		const text = pdfText(
			payload.files.get(String(notes[0].pdf)) ?? new Uint8Array(),
		);
		expect(text[0]).toBe("Avoir — frais de protection acheteur");
		expect(text).toContain("Avoir sur la facture : BNS-F-2026-000001");
	});

	it("issues nothing for a refund that kept the fee, and refuses a partial fee", async () => {
		const invoice = await issue("o-1", "pi-1");
		if (!invoice) throw new Error("no invoice");
		const kept = await withTransaction(payload, (req) =>
			creditNoteFor(req, invoice, {
				id: "rf-2",
				breakdown: { seller: 10_000, buyerProtectionFee: 0 },
			}),
		);
		expect(kept).toBeNull();
		await expect(
			withTransaction(payload, (req) =>
				creditNoteFor(req, invoice, {
					id: "rf-3",
					breakdown: { buyerProtectionFee: 700 },
				}),
			),
		).rejects.toThrow(
			"refund rf-3 returns 700 of a 1410 fee; only a full fee refund is credited",
		);
		expect(invoices().map((i) => i.kind)).toEqual(["invoice"]);
	});
});

describe("issueMissingBuyerFeeInvoices", () => {
	async function charge(orderId: string, intentId: string, occurredAt: string) {
		await withTransaction(payload, (req) =>
			postLedger(req, {
				kind: "charge",
				occurredAt,
				sourceType: "webhook-event",
				sourceId: intentId,
				currency: CURRENCY,
				order: orderId,
				shop: SHOP,
				paymentIntent: intentId,
				entries: postingFor("charge", SPLIT),
			}),
		);
	}

	it("issues the invoice a paid order is missing, once, and leaves a fresh charge to settlement", async () => {
		await charge("o-1", "pi-1", "2026-10-02T12:00:00.000Z");
		await charge("o-2", "pi-2", "2026-10-03T11:55:00.000Z"); // inside the grace
		await issue("o-3", "pi-3");
		await charge("o-3", "pi-3", "2026-10-01T12:00:00.000Z");

		const first = await issueMissingBuyerFeeInvoices(payload, { now: NOW });
		const second = await issueMissingBuyerFeeInvoices(payload, { now: NOW });

		expect(first).toEqual({ checked: 1, issued: 1, errors: 0 });
		expect(second).toEqual({ checked: 0, issued: 0, errors: 0 });
		expect(invoices().map((i) => [i.order, i.number])).toEqual([
			["o-3", "BNS-F-2026-000001"],
			["o-1", "BNS-F-2026-000002"],
		]);
	});
});

describe("buyerFeeInvoiceDownload: the signed-URL access matrix", () => {
	beforeEach(() => vi.stubEnv("STORAGE_PROVIDER", ""));

	const tokenOf = (url: string) => {
		const parsed = new URL(url, "http://x");
		return {
			path: parsed.pathname,
			exp: Number(parsed.searchParams.get("exp")),
			sig: parsed.searchParams.get("sig") ?? "",
		};
	};

	it("gives the buyer and staff a 5-minute URL, and nobody else anything", async () => {
		const invoice = await issue("o-1", "pi-1");
		const id = String(invoice?.id);
		const fileId = String(invoice?.pdf);

		const outcome = async (user: { id: string; role: string }) =>
			buyerFeeInvoiceDownload(payload, user, id).then(
				(signed) => ({
					path: tokenOf(signed.url).path,
					expiresAt: signed.expiresAt.toISOString(),
				}),
				(error: unknown) =>
					error instanceof ServiceError ? [error.code, error.status] : error,
			);

		const granted = {
			path: `/api/buyer-fee-invoices/files/${fileId}`,
			expiresAt: new Date(
				NOW.getTime() + BUYER_FEE_INVOICE_URL_TTL_SECONDS * 1000,
			).toISOString(),
		};
		const refused = [ERROR_CODES.notFound, 404];
		expect({
			buyer: await outcome({ id: BUYER, role: "user" }),
			moderator: await outcome({ id: "u-mod", role: "moderator" }),
			admin: await outcome({ id: "u-admin", role: "admin" }),
			shopOwner: await outcome({ id: "u-owner", role: "user" }),
			stranger: await outcome({ id: "u-stranger", role: "user" }),
		}).toEqual({
			buyer: granted,
			moderator: granted,
			admin: granted,
			shopOwner: refused,
			stranger: refused,
		});
		expect(BUYER_FEE_INVOICE_URL_TTL_SECONDS).toBe(300);
	});

	it("answers not found for an invoice that does not exist", async () => {
		await expect(
			buyerFeeInvoiceDownload(payload, { id: BUYER, role: "user" }, "nope"),
		).rejects.toMatchObject({ code: ERROR_CODES.notFound, status: 404 });
	});

	describe("the routes", () => {
		let dir: string;

		beforeEach(async () => {
			dir = await mkdtemp(path.join(tmpdir(), "bfi-"));
			// The collection resolves its directory beside PRIVATE_UPLOADS_DIR.
			vi.stubEnv("PRIVATE_UPLOADS_DIR", path.join(dir, "verification"));
			getPayloadMock.mockResolvedValue(payload);
		});

		afterEach(async () => {
			await rm(dir, { recursive: true, force: true });
		});

		async function storedOnDisk(): Promise<BuyerFeeInvoice> {
			const invoice = await issue("o-1", "pi-1");
			if (!invoice) throw new Error("no invoice");
			const file = payload.store["buyer-fee-invoice-files"][0];
			await mkdir(buyerFeeInvoiceFilesDir(), { recursive: true });
			await writeFile(
				path.join(buyerFeeInvoiceFilesDir(), String(file.filename)),
				payload.files.get(String(file.id)) ?? new Uint8Array(),
			);
			return invoice;
		}

		const signedIn = (id: string | null, role = "user") => {
			payload.auth.mockResolvedValue({ user: id ? { id, role } : null });
		};

		it("hands the buyer a URL that serves the PDF until it expires, then refuses it", async () => {
			const invoice = await storedOnDisk();
			const download = await import(
				"../../src/app/(frontend)/api/buyer-fee-invoices/[id]/download/route"
			);
			const files = await import(
				"../../src/app/(frontend)/api/buyer-fee-invoices/files/[docId]/route"
			);

			signedIn(BUYER);
			const response = await download.GET(new Request("http://x"), {
				params: Promise.resolve({ id: String(invoice.id) }),
			});
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				url: string;
				expiresAt: string;
			};
			const { exp, sig } = tokenOf(body.url);
			const docId = String(invoice.pdf);
			const fetchFile = () =>
				files.GET(new Request(`http://x${body.url}`), {
					params: Promise.resolve({ docId }),
				});

			const served = await fetchFile();
			expect(served.status).toBe(200);
			expect(served.headers.get("content-type")).toBe("application/pdf");
			expect(
				Buffer.from(await served.arrayBuffer())
					.subarray(0, 8)
					.toString(),
			).toBe("%PDF-1.4");

			vi.setSystemTime(new Date(exp - 1));
			expect(verifyLocalFileToken(docId, exp, sig)).toBe(true);
			vi.setSystemTime(new Date(exp));
			expect(verifyLocalFileToken(docId, exp, sig)).toBe(false);
			expect((await fetchFile()).status).toBe(403);
		});

		it("refuses a stranger and an anonymous caller", async () => {
			const invoice = await storedOnDisk();
			const download = await import(
				"../../src/app/(frontend)/api/buyer-fee-invoices/[id]/download/route"
			);
			const call = () =>
				download.GET(new Request("http://x"), {
					params: Promise.resolve({ id: String(invoice.id) }),
				});

			signedIn("u-stranger");
			const stranger = await call();
			signedIn(null);
			const anonymous = await call();
			expect([stranger.status, anonymous.status]).toEqual([404, 401]);
		});
	});
});

describe("the VAT export", () => {
	async function post(input: {
		kind: "charge" | "commission_earned";
		at: string;
		orderId: string;
		sourceId: string;
	}) {
		await withTransaction(payload, (req) =>
			postLedger(req, {
				kind: input.kind,
				occurredAt: input.at,
				sourceType: input.kind === "charge" ? "webhook-event" : "order-event",
				sourceId: input.sourceId,
				currency: CURRENCY,
				order: input.orderId,
				shop: SHOP,
				entries:
					input.kind === "charge"
						? postingFor("charge", SPLIT)
						: postingFor("commission_earned", {
								commission: SPLIT.commission,
								commissionVat: SPLIT.commissionVat,
							}),
			}),
		);
	}

	beforeEach(async () => {
		// 23:30 UTC on 30 September is already October in Douala.
		await post({
			kind: "charge",
			at: "2026-09-30T23:30:00.000Z",
			orderId: "o-1",
			sourceId: "pi-1",
		});
		await post({
			kind: "charge",
			at: "2026-09-30T22:30:00.000Z",
			orderId: "o-2",
			sourceId: "pi-2",
		});
		await post({
			kind: "commission_earned",
			at: "2026-10-20T09:00:00.000Z",
			orderId: "o-1",
			sourceId: "oe-9",
		});
	});

	it("lists the month's vat_payable movements by source, one row each", async () => {
		expect(await vatReportCsv(payload, "2026-10")).toBe(
			[
				"occurredAt,kind,sourceType,sourceId,orderNumber,currency,vatCollected,vatReversed",
				"2026-09-30T23:30:00.000Z,charge,webhook-event,pi-1,BNS-2610-000001,XAF,228,0",
				"2026-10-20T09:00:00.000Z,commission_earned,order-event,oe-9,BNS-2610-000001,XAF,607,0",
				"",
			].join("\n"),
		);
		expect((await vatReportCsv(payload, "2026-09")).split("\n")[1]).toBe(
			"2026-09-30T22:30:00.000Z,charge,webhook-event,pi-2,BNS-2610-000002,XAF,228,0",
		);
		expect(await vatReportCsv(payload, "2026-10", "EUR")).toBe(
			"occurredAt,kind,sourceType,sourceId,orderNumber,currency,vatCollected,vatReversed\n",
		);
	});

	it("serves the CSV to an admin only", async () => {
		getPayloadMock.mockResolvedValue(payload);
		const route = await import(
			"../../src/app/(frontend)/api/staff/finance/vat/route"
		);
		const as = async (
			user: { id: string; role: string } | null,
			query: string,
		) => {
			payload.auth.mockResolvedValue({ user });
			return route.GET(new Request(`http://x/api/staff/finance/vat${query}`));
		};

		const admin = await as({ id: "u-admin", role: "admin" }, "?month=2026-10");
		expect(admin.status).toBe(200);
		expect(admin.headers.get("content-type")).toBe("text/csv; charset=utf-8");
		expect(admin.headers.get("content-disposition")).toBe(
			'attachment; filename="vat-2026-10.csv"',
		);
		expect((await admin.text()).split("\n")).toHaveLength(4);

		const statuses = [
			(await as({ id: "u-mod", role: "moderator" }, "?month=2026-10")).status,
			(await as(null, "?month=2026-10")).status,
			(await as({ id: "u-admin", role: "admin" }, "?month=2026-13")).status,
			(await as({ id: "u-admin", role: "admin" }, "")).status,
		];
		expect(statuses).toEqual([403, 401, 400, 400]);
	});
});
