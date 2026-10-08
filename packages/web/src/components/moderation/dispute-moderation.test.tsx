import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import type {
	DisputeView,
	ModerationDisputeRow,
} from "../../../../api/src/contracts/disputes";
import { DisputeEvidence } from "./dispute-evidence";
import { DisputeQueueTable } from "./dispute-queue-table";

function render(node: React.ReactNode): string {
	return renderToStaticMarkup(
		<QueryClientProvider client={new QueryClient()}>
			<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
				{node}
			</NextIntlClientProvider>
		</QueryClientProvider>,
	);
}

const row = (over: Partial<ModerationDisputeRow>): ModerationDisputeRow => ({
	id: "d1",
	number: "DSP-0001",
	orderId: "o1",
	orderNumber: "ORD-9",
	shopId: "s1",
	buyerId: "b1",
	reason: "not_received",
	subject: "goods",
	paymentMethod: "cod",
	status: "under_review",
	amountAtStake: 12_000,
	deadline: "2026-10-01T10:00:00.000Z",
	overdue: false,
	assignedTo: null,
	ageDays: 3,
	...over,
});

describe("DisputeQueueTable", () => {
	test("renders the plan's columns and the row values", () => {
		const html = render(<DisputeQueueTable rows={[row({})]} viewerId="m1" />);
		for (const heading of [
			"Dispute",
			"Reason",
			"Payment",
			"Amount",
			"Status",
			"Deadline",
			"Assignee",
			"Age",
		])
			expect(html).toContain(`>${heading}</th>`);
		expect(html).toContain("DSP-0001");
		expect(html).toContain("Order not received");
		expect(html).toContain("Cash on delivery");
		expect(html).toContain("Under review");
		expect(html).toContain("Unassigned");
		expect(html).toContain("3 days");
	});
	test("an overdue deadline is red and badged, a normal one is not", () => {
		const overdue = render(
			<DisputeQueueTable rows={[row({ overdue: true })]} viewerId="m1" />,
		);
		expect(overdue).toContain('data-tone="overdue"');
		expect(overdue).toContain("text-red-700");
		expect(overdue).toContain("Past deadline");
		const normal = render(<DisputeQueueTable rows={[row({})]} viewerId="m1" />);
		expect(normal).toContain('data-tone="normal"');
		expect(normal).not.toContain("text-red-700");
	});
	test("the viewer's own assignment reads as You", () => {
		expect(
			render(
				<DisputeQueueTable rows={[row({ assignedTo: "m1" })]} viewerId="m1" />,
			),
		).toContain("You");
	});
});

describe("DisputeEvidence for the moderator", () => {
	const item = (
		over: Partial<DisputeView["evidence"][number]>,
	): DisputeView["evidence"][number] => ({
		id: "e1",
		kind: "photo",
		mimeType: "image/jpeg",
		size: 2048,
		uploadedByType: "buyer",
		capturedAt: null,
		sha256Reused: false,
		visibility: "parties",
		...over,
	});

	test("a staff-visibility row is rendered and marked as staff only", () => {
		const html = render(
			<DisputeEvidence
				disputeId="d1"
				evidence={[
					item({}),
					item({ id: "e2", visibility: "staff", uploadedByType: "moderator" }),
				]}
			/>,
		);
		expect(html.match(/data-visibility="staff"/g)).toHaveLength(1);
		expect(html.match(/data-visibility="parties"/g)).toHaveLength(1);
		expect(html.match(/Staff only/g)).toHaveLength(1);
	});
	test("the reused-hash warning shows only on the flagged file", () => {
		const html = render(
			<DisputeEvidence
				disputeId="d1"
				evidence={[item({ sha256Reused: true }), item({ id: "e2" })]}
			/>,
		);
		expect(html.match(/File already used elsewhere/g)).toHaveLength(1);
	});
});
