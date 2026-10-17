import { describe, expect, test } from "bun:test";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import type { ModerationQueueItem } from "../../../../api/src/contracts/moderationConsole";
import { ConsoleQueueTable } from "./console-queue-table";
import { DetailEmpty, MasterDetail } from "./master-detail";
import { QueueItemPanel } from "./queue-item-panel";

function render(node: React.ReactNode, locale: "en" | "fr" = "en"): string {
	return renderToStaticMarkup(
		<NextIntlClientProvider
			locale={locale}
			messages={locale === "en" ? en : fr}
			timeZone="UTC"
		>
			{node}
		</NextIntlClientProvider>,
	);
}

const NOW = new Date("2026-10-17T12:00:00.000Z");

const item = (over: Partial<ModerationQueueItem>): ModerationQueueItem => ({
	type: "report",
	id: "r1",
	title: "Fake sneakers",
	subtitle: "Kana Shop",
	detail: "fraud",
	createdAt: "2026-10-15T12:00:00.000Z",
	dueAt: null,
	overdue: false,
	assignee: null,
	severity: null,
	score: null,
	shopId: "s1",
	targetType: "listing",
	targetId: "l1",
	orderId: null,
	...over,
});

const panelHref = ({ type, id }: { type: string; id: string }) =>
	`/moderation?item=${type}%3A${id}`;

describe("ConsoleQueueTable", () => {
	test("renders the columns, the translated detail, the age and the assignee", () => {
		const html = render(
			<ConsoleQueueTable
				items={[
					item({}),
					item({
						type: "risk",
						id: "k1",
						title: "+237 6 00 00 00",
						detail: "velocity.orders_per_phone",
						assignee: { id: "m1", name: "Awa" },
					}),
				]}
				viewerId="m1"
				selection={null}
				panelHref={panelHref}
				now={NOW}
			/>,
		);
		for (const heading of [
			"Type",
			"Item",
			"Reason",
			"Age",
			"Deadline",
			"Assignee",
		])
			expect(html).toContain(`>${heading}</th>`);
		expect(html).toContain("Fake sneakers");
		expect(html).toContain("Kana Shop");
		expect(html).toContain("Fraud");
		expect(html).toContain("Many orders from one phone");
		expect(html).toContain("2 days ago");
		expect(html).toContain("Unassigned");
		expect(html).toContain(">Me<");
	});

	test("workspace types link to their workspace, the rest open the panel", () => {
		const html = render(
			<ConsoleQueueTable
				items={[
					item({ type: "verification", id: "v1", detail: "level:2" }),
					item({ type: "dispute", id: "d1", detail: "not_received" }),
					item({ type: "payoutAccount", id: "p1", detail: "bank" }),
				]}
				viewerId={null}
				selection={{ type: "payoutAccount", id: "p1" }}
				panelHref={panelHref}
				now={NOW}
			/>,
		);
		expect(html).toContain('href="/moderation/verification/v1"');
		expect(html).toContain('href="/moderation/disputes/d1"');
		expect(html).toContain('href="/moderation?item=payoutAccount%3Ap1"');
		expect(html).toContain("Level 2");
		expect(html).toContain("Order not received");
		expect(html).toContain("Bank transfer");
		expect(html).toMatch(/data-type="payoutAccount" aria-current="true"/);
	});

	test("an overdue row is badged, an unknown code shows raw", () => {
		const html = render(
			<ConsoleQueueTable
				items={[
					item({
						type: "dispute",
						id: "d2",
						detail: "a_new_reason",
						dueAt: "2026-10-16T10:00:00.000Z",
						overdue: true,
					}),
				]}
				viewerId={null}
				selection={null}
				panelHref={panelHref}
				now={NOW}
			/>,
		);
		expect(html).toContain('data-tone="overdue"');
		expect(html).toContain("Overdue");
		expect(html).toContain("a_new_reason");
	});

	test("speaks French", () => {
		const html = render(
			<ConsoleQueueTable
				items={[item({})]}
				viewerId={null}
				selection={null}
				panelHref={panelHref}
				now={NOW}
			/>,
			"fr",
		);
		expect(html).toContain("Signalement");
		expect(html).toContain("Fraude");
		expect(html).toContain("Non attribué");
	});
});

describe("QueueItemPanel", () => {
	test("a report links to the reports section", () => {
		const html = render(<QueueItemPanel item={item({})} viewerId={null} />);
		expect(html).toContain("Fake sneakers");
		expect(html).toContain("Listing");
		expect(html).toContain('href="/moderation/reports?item=report%3Ar1"');
		expect(html).toContain("Open in Reports");
		expect(html).not.toContain("Assign to me");
	});

	test("an unassigned risk flag offers the claim and shows its severity", () => {
		const html = render(
			<QueueItemPanel
				item={item({
					type: "risk",
					id: "k1",
					detail: "cod.refusal_streak",
					severity: "high",
					score: 80,
					targetType: "shop",
				})}
				viewerId={null}
				claim={{ run: () => {}, pending: false, error: null }}
			/>,
		);
		expect(html).toContain("Cash-on-delivery refusal streak");
		expect(html).toContain("High");
		expect(html).toContain("80");
		expect(html).toContain("Assign to me");
		expect(html).toContain('href="/moderation/risk?item=risk%3Ak1"');
	});

	test("a payout account links to its shop sheet", () => {
		const html = render(
			<QueueItemPanel
				item={item({ type: "payoutAccount", id: "p1", detail: "mtn_momo" })}
				viewerId={null}
			/>,
		);
		expect(html).toContain("MTN Mobile Money");
		expect(html).toContain('href="/moderation/shops/s1"');
	});
});

describe("MasterDetail", () => {
	test("closed: the list shows and the empty panel waits at xl", () => {
		const html = render(
			<MasterDetail
				list={<p>LIST</p>}
				detail={<p>DETAIL</p>}
				open={false}
				onClose={() => {}}
			/>,
		);
		expect(html).toContain("LIST");
		expect(html).not.toContain("DETAIL");
		expect(html).toContain("No item selected");
	});

	test("open: the list hides below xl and the panel has back and close", () => {
		const html = render(
			<MasterDetail
				list={<p>LIST</p>}
				detail={<p>DETAIL</p>}
				open
				onClose={() => {}}
			/>,
		);
		expect(html).toContain('class="min-w-0 hidden xl:block"');
		expect(html).toContain("DETAIL");
		expect(html).toContain("Back to the list");
		expect(html).toContain('aria-label="Close"');
	});

	test("DetailEmpty speaks French", () => {
		expect(render(<DetailEmpty />, "fr")).toContain(
			"Aucun élément sélectionné",
		);
	});
});
