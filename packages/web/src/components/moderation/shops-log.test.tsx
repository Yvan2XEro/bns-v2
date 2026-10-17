import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import type { ModerationShopSheet } from "~/lib/moderation-shops";
import type { Report } from "~/types";
import type {
	ModerationLogRow,
	ModerationShopRow,
} from "../../../../api/src/contracts/moderationConsole";
import { LogTable } from "./log-table";
import { ShopSheet } from "./shop-sheet";
import { ShopsTable } from "./shops-table";

function render(node: React.ReactNode, locale: "en" | "fr" = "en"): string {
	return renderToStaticMarkup(
		<QueryClientProvider client={new QueryClient()}>
			<NextIntlClientProvider
				locale={locale}
				messages={locale === "en" ? en : fr}
				timeZone="UTC"
			>
				{node}
			</NextIntlClientProvider>
		</QueryClientProvider>,
	);
}

const row = (over: Partial<ModerationShopRow> = {}): ModerationShopRow => ({
	id: "s1",
	name: "Akwa Tech Store",
	handle: "akwatech",
	logoUrl: null,
	status: "active",
	level: 2,
	owner: { id: "u1", name: "Aïcha Mbarga" },
	openReports: 2,
	strikes: 1,
	createdAt: "2024-03-10T09:00:00.000Z",
	...over,
});

const report = (over: Partial<Report> = {}): Report => ({
	id: "r1",
	reporter: "u9",
	targetType: "listing",
	targetId: "listing000123",
	reason: "fraud",
	description: null,
	status: "pending",
	createdAt: "2026-10-15T12:00:00.000Z",
	updatedAt: "2026-10-15T12:00:00.000Z",
	...over,
});

const sheet = (
	over: Partial<ModerationShopSheet> = {},
): ModerationShopSheet => ({
	shop: {
		id: "s1",
		handle: "akwatech",
		name: "Akwa Tech Store",
		status: "active",
		level: 2,
		logo: null,
		createdAt: "2024-03-10T09:00:00.000Z",
	},
	owner: {
		id: "u1",
		name: "Aïcha Mbarga",
		email: "aicha@example.test",
		role: "user",
		createdAt: "2024-03-01T09:00:00.000Z",
	},
	suspension: {
		active: false,
		expired: false,
		indefinite: false,
		since: null,
		until: null,
		reason: null,
		note: null,
		by: null,
	},
	counts: {
		publishedListings: 12,
		activeProducts: 304,
		draftProducts: 8,
		reportsAgainst: 2,
	},
	reports: [report(), report({ id: "r2", reason: "spam", status: "resolved" })],
	history: [
		{
			id: "h1",
			action: "shop.unsuspend",
			actor: { id: "m1", name: "Modo Paul" },
			reason: null,
			note: "Documents received",
			createdAt: "2026-06-23T10:00:00.000Z",
		},
		{
			id: "h0",
			action: "shop.suspend",
			actor: { id: "m1", name: "Modo Paul" },
			reason: "fraud",
			note: null,
			createdAt: "2026-06-01T10:00:00.000Z",
		},
	],
	team: [
		{
			id: "m-owner",
			name: "Aïcha Mbarga",
			role: "owner",
			joinedAt: "2024-03-10T09:00:00.000Z",
		},
	],
	activity: [],
	payments: {
		connectedAccount: {
			status: "active",
			chargesEnabled: true,
			payoutsEnabled: true,
			lastSyncedAt: null,
		},
		payoutAccount: null,
		pendingAccounts: [
			{
				id: "pa1",
				method: "orange_money",
				accountName: "Aicha Mbarga",
				accountNumberMasked: "•••• 4521",
				nameMatch: { result: "partial", identityName: "Aïcha M.", score: 0.7 },
				createdAt: "2026-10-16T09:00:00.000Z",
			},
		],
		holds: [
			{
				id: "hold1",
				scope: "shop",
				orderId: null,
				reason: "fraud_signal",
				reasonCategory: "security",
				blocksCharges: false,
				until: null,
				createdByType: "system",
				createdBy: null,
				note: null,
				createdAt: "2026-10-14T09:00:00.000Z",
			},
		],
		openExposure: 0,
		lastPayouts: [],
		refundRate: { windowDays: 90, orders: 10, refundedOrders: 1 },
	},
	standing: {
		activeWeight: 3,
		effectsEnabled: true,
		restrictions: {
			codCapHalved: true,
			protectedCapHalved: true,
			protectedUnavailable: false,
		},
		strikes: [
			{
				id: "k1",
				kind: "dispute_lost",
				weight: 3,
				status: "active",
				expiresAt: "2027-01-01T00:00:00.000Z",
				sourceType: "dispute",
				createdAt: "2026-09-01T00:00:00.000Z",
			},
		],
	},
	...over,
});

const moderator = { id: "m1", role: "moderator" };

describe("ShopsTable", () => {
	test("lists identity, owner, level, status, reports and strikes, linking to the sheet", () => {
		const html = render(<ShopsTable shops={[row()]} />);
		for (const heading of [
			"Shop",
			"Owner",
			"Level",
			"Status",
			"Reports",
			"Strikes",
			"Created",
		])
			expect(html).toContain(`>${heading}</th>`);
		expect(html).toContain('href="/moderation/shops/s1"');
		expect(html).toContain("Akwa Tech Store");
		expect(html).toContain("@akwatech");
		expect(html).toContain("Aïcha Mbarga");
		expect(html).toContain(">AT<");
	});

	test("reads in French with the suspended status", () => {
		const html = render(
			<ShopsTable shops={[row({ status: "suspended" })]} />,
			"fr",
		);
		expect(html).toContain(">Boutique</th>");
		expect(html).toContain("Suspendu");
	});
});

describe("ShopSheet", () => {
	test("shows identity, figures, reports, strikes, history, team and payments", () => {
		const html = render(<ShopSheet sheet={sheet()} viewer={moderator} />);
		expect(html).toContain("Akwa Tech Store");
		expect(html).toContain("aicha@example.test");
		expect(html).toContain(
			'href="/moderation/log?targetType=shop&amp;targetId=s1"',
		);
		expect(html).toContain('href="/s/akwatech"');
		expect(html).toContain(">304<");
		expect(html).toContain("Products on sale");
		expect(html).toContain('href="/moderation/reports?item=report%3Ar1"');
		expect(html).toContain("Cash-on-delivery cap halved");
		expect(html).toContain("Dispute lost");
		expect(html).toContain("Documents received");
		expect(html).toContain("No suspension in progress");
		expect(html).toContain("Last sanction lifted on");
		expect(html).toContain("Suspend the shop");
		expect(html).toContain("Orange Money");
		expect(html).toContain("Approve");
		expect(html).toContain("Fraud signal");
		expect(html).toContain("Release");
		expect(html).toContain("Hold payouts");
	});

	test("a suspended shop offers the lift, with the restore choice once opened", () => {
		const html = render(
			<ShopSheet
				sheet={sheet({
					shop: { ...sheet().shop, status: "suspended" },
					suspension: {
						active: true,
						expired: false,
						indefinite: true,
						since: "2026-10-01T00:00:00.000Z",
						until: null,
						reason: "fraud",
						note: "Counterfeit stock",
						by: { id: "m1", name: "Modo Paul" },
					},
				})}
				viewer={moderator}
			/>,
			"fr",
		);
		expect(html).toContain("Suspendue jusqu&#x27;à levée");
		expect(html).toContain("Counterfeit stock");
		expect(html).toContain("Lever la suspension");
		expect(html).toContain("Remettre ses annonces en ligne");
		expect(html).not.toContain("Suspendre la boutique");
	});

	test("a moderator facing another moderator's shop is told why no sanction is offered", () => {
		const html = render(
			<ShopSheet
				sheet={sheet({ owner: { ...sheet().owner!, role: "moderator" } })}
				viewer={moderator}
			/>,
		);
		expect(html).toContain("Only a moderator who outranks the owner");
		expect(html).not.toContain("Suspend the shop");
	});
});

describe("LogTable", () => {
	const entry = (over: Partial<ModerationLogRow> = {}): ModerationLogRow => ({
		id: "e1",
		createdAt: "2026-10-16T08:30:00.000Z",
		action: "shop.suspend",
		actor: { id: "m1", name: "Modo Paul" },
		actorRole: "moderator",
		targetType: "shop",
		targetId: "shop00000001",
		reason: "fraud",
		note: "Repeat offender",
		metadata: null,
		...over,
	});

	test("translates the action, links the target and shows the reason and note", () => {
		const html = render(
			<LogTable
				rows={[
					entry(),
					entry({
						id: "e2",
						action: "risk_flag.dismiss",
						targetType: "risk-flag",
						targetId: "flag01",
						reason: null,
						note: null,
					}),
					entry({
						id: "e3",
						action: "order.cancel",
						actor: null,
						actorRole: "system",
						targetType: "order",
						targetId: "order0042",
					}),
				]}
			/>,
		);
		for (const heading of [
			"Date",
			"Moderator",
			"Action",
			"Target",
			"Reason / note",
		])
			expect(html).toContain(`>${heading}</th>`);
		expect(html).toContain("Modo Paul");
		expect(html).toContain('href="/moderation/shops/shop00000001"');
		expect(html).toContain('href="/moderation/risk?item=risk%3Aflag01"');
		expect(html).toContain('title="order0042">…er0042</span>');
		expect(html).not.toContain("/order");
		expect(html).toContain("Fraud");
		expect(html).toContain("Repeat offender");
		expect(html).toContain("System");
	});
});
