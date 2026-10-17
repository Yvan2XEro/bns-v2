import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import { moderationConsoleKeys } from "~/lib/query-keys";
import type { Listing, Report } from "~/types";
import type {
	RiskFlagDetail,
	RiskFlagQueueItem,
	RiskFlagStats,
} from "../../../../api/src/contracts/moderationConsole";
import { ListingDetail } from "./listing-panel";
import { ReportDetail } from "./report-panel";
import { PendingListingsTable, ReportsTable } from "./reports-table";
import { RiskKpis } from "./risk-kpis";
import { RiskDetail } from "./risk-panel";
import { RiskTable } from "./risk-table";

function render(
	node: React.ReactNode,
	locale: "en" | "fr" = "en",
	client = new QueryClient(),
): string {
	return renderToStaticMarkup(
		<QueryClientProvider client={client}>
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

const NOW = new Date("2026-10-17T12:00:00.000Z");
const panelHref = ({ type, id }: { type: string; id: string }) =>
	`/moderation/reports?item=${type}%3A${id}`;
const noop = () => {};

const report = (over: Partial<Report> = {}): Report => ({
	id: "r1",
	reporter: {
		id: "u9",
		name: "Awa",
		email: "awa@example.test",
	} as Report["reporter"],
	targetType: "listing",
	targetId: "listing000123",
	reason: "fraud",
	description: "Fake sneakers sold as originals",
	status: "pending",
	createdAt: "2026-10-15T12:00:00.000Z",
	updatedAt: "2026-10-15T12:00:00.000Z",
	...over,
});

const listing = (over: Partial<Listing> = {}): Listing =>
	({
		id: "l1",
		title: "Air Max 90",
		description: "Brand new, size 42.",
		price: 45000,
		images: [{ id: "i1", image: { url: "/a.jpg", thumbnailURL: "/a-t.jpg" } }],
		location: "douala",
		category: "c1",
		shop: { id: "s1", name: "Kana Shop" },
		status: "pending",
		resale: { desiredStatus: "published" },
		createdAt: "2026-10-16T12:00:00.000Z",
		updatedAt: "2026-10-16T12:00:00.000Z",
		...over,
	}) as Listing;

const flag = (over: Partial<RiskFlagQueueItem> = {}): RiskFlagQueueItem => ({
	id: "k1",
	subjectType: "shop",
	subjectLabel: "Deïdo Mobile",
	signal: "resale.self_dealing",
	score: 86,
	severity: "high",
	status: "open",
	occurrences: 4,
	firstSeenAt: "2026-10-10T12:00:00.000Z",
	lastSeenAt: "2026-10-14T19:02:00.000Z",
	autoEffects: ["payout_hold"],
	resolution: "none",
	resolutionNote: null,
	reviewedAt: null,
	assignedTo: null,
	...over,
});

const detail = (over: Partial<RiskFlagDetail> = {}): RiskFlagDetail => ({
	flag: flag(),
	subject: {
		type: "shop",
		id: "s1",
		name: "Deïdo Mobile",
		level: 2,
		status: "active",
		rates: { sellerCancellation: 0.25 },
		openDisputes: 1,
	},
	evidenceRows: [
		{ label: "Orders count", value: 4 },
		{ label: "Same buyer", value: true },
	],
	relatedFlags: [flag({ id: "k2", subjectLabel: "Mboppi Accessoires" })],
	moderationHistory: [
		{ id: "h1", action: "shop.suspend", createdAt: "2026-09-01T10:00:00.000Z" },
	],
	...over,
});

describe("ReportsTable", () => {
	test("lists reason, reported item, reporter and age, linking to the panel", () => {
		const html = render(
			<ReportsTable
				reports={[report()]}
				selection={{ type: "report", id: "r1" }}
				panelHref={panelHref}
				now={NOW}
			/>,
		);
		for (const heading of [
			"Reason",
			"Reported",
			"Reporter",
			"Received",
			"Status",
		])
			expect(html).toContain(`>${heading}</th>`);
		expect(html).toContain("Fraud");
		expect(html).toContain("Fake sneakers sold as originals");
		expect(html).toContain("…000123");
		expect(html).toContain("Awa");
		expect(html).toContain("2 days ago");
		expect(html).toContain('href="/moderation/reports?item=report%3Ar1"');
		expect(html).toContain('aria-current="true"');
	});
});

describe("PendingListingsTable", () => {
	test("shows the cover, title, shop and waiting time", () => {
		const html = render(
			<PendingListingsTable
				listings={[listing()]}
				selection={null}
				panelHref={panelHref}
				now={NOW}
			/>,
			"fr",
		);
		expect(html).toContain(">Annonce</th>");
		expect(html).toContain('src="/a-t.jpg"');
		expect(html).toContain("Air Max 90");
		expect(html).toContain("Kana Shop");
		expect(html).toContain('href="/moderation/reports?item=listing%3Al1"');
	});
});

describe("ReportDetail", () => {
	test("shows the report, the reported listing and the decision form", () => {
		const client = new QueryClient();
		client.setQueryData(
			moderationConsoleKeys.reportTarget("listing", "listing000123"),
			{ type: "listing", listing: listing({ id: "listing000123" }) },
		);
		client.setQueryData(
			moderationConsoleKeys.targetReports("listing", "listing000123"),
			{
				docs: [
					report(),
					report({ id: "r2", reason: "spam", status: "resolved" }),
				],
				totalDocs: 2,
				hasNextPage: false,
			},
		);
		const html = render(
			<ReportDetail
				report={report()}
				listingHref={(id) =>
					`/moderation/reports?tab=listings&item=listing%3A${id}`
				}
				onDecided={noop}
			/>,
			"en",
			client,
		);
		expect(html).toContain("Reported by Awa");
		expect(html).toContain("Fake sneakers sold as originals");
		expect(html).toContain("Reported Listing");
		expect(html).toContain("Air Max 90");
		expect(html).toContain('href="/listing/listing000123"');
		expect(html).toContain("Review this listing");
		expect(html).toContain("1 other report on this item");
		expect(html).toContain("Spam or scam");
		expect(html).toContain(">Resolve<");
		expect(html).toContain(">Dismiss<");
		expect(html).toContain("Resolution note");
		expect(html).toContain(">Apply<");
	});

	test("a decided report shows its resolution instead of the form", () => {
		const html = render(
			<ReportDetail
				report={report({ status: "resolved", resolution: "Listing removed" })}
				listingHref={() => "#"}
				onDecided={noop}
			/>,
			"fr",
		);
		expect(html).toContain("Traités");
		expect(html).toContain("Listing removed");
		expect(html).not.toContain(">Appliquer<");
	});
});

describe("ListingDetail", () => {
	test("shows photos, price, shop link, description and approve / reject", () => {
		const html = render(<ListingDetail listing={listing()} onDecided={noop} />);
		expect(html).toContain('alt="Photo of Air Max 90"');
		expect(html).toContain("Brand new, size 42.");
		expect(html).toContain('href="/moderation/shops/s1"');
		expect(html).toContain('href="/listing/l1"');
		expect(html).toContain(">Approve<");
		expect(html).toContain(">Reject<");
	});

	test("a listing no longer pending has no decision form", () => {
		const html = render(
			<ListingDetail
				listing={listing({ status: "published" })}
				onDecided={noop}
			/>,
		);
		expect(html).toContain("no longer awaiting review (Published)");
		expect(html).not.toContain(">Approve<");
	});
});

describe("RiskTable", () => {
	test("renders subject, signal, score and status like the mockup", () => {
		const html = render(
			<RiskTable
				flags={[
					flag(),
					flag({
						id: "k2",
						status: "reviewed",
						subjectType: "phone",
						subjectLabel: null,
					}),
					flag({ id: "k3", assignedTo: "m1" }),
				]}
				viewerId="m1"
				selection={null}
				panelHref={panelHref}
			/>,
			"fr",
		);
		for (const heading of ["Sujet", "Signal", "Score", "Détecté", "Statut"])
			expect(html).toContain(`>${heading}</th>`);
		expect(html).toContain("Deïdo Mobile");
		expect(html).toContain("Revente à soi-même");
		expect(html).toContain(">86");
		expect(html).toContain("Nouveau");
		expect(html).toContain("Surveillé");
		expect(html).toContain("À moi");
		expect(html).toContain("Numéro de téléphone");
	});
});

describe("RiskKpis", () => {
	const stats: RiskFlagStats = {
		open: 5,
		openBySubject: { user: 1, shop: 3, phone: 1, device: 0 },
		highScore: 3,
		highScoreThreshold: 80,
		payoutHeld: 1,
		reviewed: 2,
		decidedLast30Days: 74,
		dismissedLast30Days: 9,
	};

	test("shows only the tiles the data supports", () => {
		const html = render(<RiskKpis stats={stats} />, "fr");
		expect(html).toContain("Score 80 et plus");
		expect(html).toContain("Versements gelés");
		expect(html).toContain("Faux positifs sur 30 jours");
		expect(html).toContain("9 signaux écartés sur 74 décidés");
		expect(html).toMatch(/12\s%/);
		expect(html).not.toContain("Marges de revente");
	});

	test("no decision in 30 days reads as a dash, not 0 %", () => {
		const html = render(
			<RiskKpis
				stats={{ ...stats, decidedLast30Days: 0, dismissedLast30Days: 0 }}
			/>,
		);
		expect(html).toContain(">—<");
	});
});

describe("RiskDetail", () => {
	test("shows evidence, subject, links, history and the shop decisions", () => {
		const html = render(
			<RiskDetail
				detail={detail()}
				viewerId="m1"
				isAdmin={false}
				panelHref={panelHref}
				onDecided={noop}
			/>,
		);
		expect(html).toContain("Signal k1");
		expect(html).toContain("Resale to oneself");
		expect(html).toContain("4 occurrences");
		expect(html).toContain("Payouts held");
		expect(html).toContain(">Assign to me<");
		expect(html).toContain("Orders count");
		expect(html).toContain(">Yes<");
		expect(html).toContain('href="/moderation/shops/s1"');
		expect(html).toContain("25 %");
		expect(html).toContain("Mboppi Accessoires");
		expect(html).toContain('href="/moderation/reports?item=risk%3Ak2"');
		expect(html).toContain("Shop suspended");
		for (const decision of [
			"Dismiss",
			"Watch for 30 days",
			"Suspend the shop",
			"Hold the payouts",
		])
			expect(html).toContain(`>${decision}<`);
		expect(html).toContain("The automatic payout hold is released.");
		expect(html).not.toContain("Suspend the account");
	});

	test("a dismissed flag shows its resolution and offers no decision", () => {
		const html = render(
			<RiskDetail
				detail={detail({
					flag: flag({
						status: "dismissed",
						resolution: "false_positive",
						resolutionNote: "Separate owners",
						reviewedAt: "2026-10-16T09:00:00.000Z",
						assignedTo: "m2",
					}),
				})}
				viewerId="m1"
				isAdmin={false}
				panelHref={panelHref}
				onDecided={noop}
			/>,
			"fr",
		);
		expect(html).toContain("Faux positif");
		expect(html).toContain("Separate owners");
		expect(html).not.toContain(">Appliquer<");
		expect(html).not.toContain(">M&#x27;attribuer<");
		expect(html).not.toContain("attribuer<");
	});

	test("a phone subject lists its linked shops and offers no sanction", () => {
		const html = render(
			<RiskDetail
				detail={detail({
					flag: flag({ subjectType: "phone", subjectLabel: "+237 6•• 63" }),
					subject: {
						type: "phone",
						label: "+237 6•• 63",
						linkedUsers: ["u1", "u2"],
						linkedShops: ["shop000777"],
					},
				})}
				viewerId="m1"
				isAdmin={false}
				panelHref={panelHref}
				onDecided={noop}
			/>,
		);
		expect(html).toContain('href="/moderation/shops/shop000777"');
		expect(html).toContain("2 linked accounts");
		expect(html).not.toContain("Suspend the shop");
		expect(html).toContain(">Watch for 30 days<");
	});
});
