import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import {
	noteReady,
	redactAction,
	revokeAction,
} from "~/lib/moderation-dispute-notes";
import type {
	DisputeView,
	ModerationDisputeRow,
	ShopStandingView,
} from "../../../../api/src/contracts/disputes";
import { ConfirmNotePanel } from "./dispute-confirm-note";
import {
	DisputeEvidence,
	EvidenceMedia,
	EvidenceMetadata,
	EvidenceZoomBody,
} from "./dispute-evidence";
import { DisputeQueueTable } from "./dispute-queue-table";
import { RedactMessageControl } from "./dispute-redact-message";
import { DisputeStrikes, StrikeRow } from "./dispute-strikes";

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

describe("evidence metadata panel", () => {
	const item: DisputeView["evidence"][number] = {
		id: "e1",
		kind: "photo",
		mimeType: "image/jpeg",
		size: 20_480,
		uploadedByType: "seller",
		capturedAt: "2026-09-30T14:05:00.000Z",
		sha256Reused: false,
		visibility: "parties",
	};
	test("renders the served capture date, type, size and uploader", () => {
		const html = render(<EvidenceMetadata item={item} />);
		expect(html).toContain('data-field="capturedAt">Sep 30, 2026, 2:05 PM<');
		expect(html).toContain('data-field="mimeType">image/jpeg<');
		expect(html).toContain('data-field="size">20 KB<');
		expect(html).toContain('data-field="uploader">the seller<');
	});
	test("a missing capture date says so instead of inventing one", () => {
		const html = render(
			<EvidenceMetadata item={{ ...item, capturedAt: null }} />,
		);
		expect(html).toContain("No capture date in the file");
	});
});

describe("evidence zoom", () => {
	const signed = (mimeType: string) => ({
		url: "https://signed.example/e1?sig=abc",
		expiresAt: "2026-10-01T10:05:00.000Z",
		mimeType,
	});
	test("an image offers a zoom control, a video and a pdf do not", () => {
		expect(
			render(<EvidenceMedia signed={signed("image/png")} alt="x" />),
		).toContain(">Zoom</button>");
		expect(
			render(<EvidenceMedia signed={signed("video/mp4")} alt="x" />),
		).not.toContain("Zoom");
		expect(
			render(<EvidenceMedia signed={signed("application/pdf")} alt="x" />),
		).not.toContain("Zoom");
	});
	test("the dialog body shows the full-size image from the signed URL", () => {
		const html = render(
			<EvidenceZoomBody url="https://signed.example/e1?sig=abc" alt="Photo" />,
		);
		expect(html).toContain('src="https://signed.example/e1?sig=abc"');
		expect(html).toContain('alt="Photo"');
	});
});

describe("redact and revoke are confirm-gated", () => {
	test("rendering either control fetches nothing and shows only the entry button", () => {
		const calls: unknown[] = [];
		const original = globalThis.fetch;
		globalThis.fetch = ((...args: unknown[]) => {
			calls.push(args);
			return Promise.reject(new Error("no network in a render"));
		}) as typeof fetch;
		try {
			const redact = render(
				<RedactMessageControl disputeId="d1" messageId="m1" />,
			);
			const revoke = render(
				<StrikeRow disputeId="d1" canRevoke strike={strike({ id: "s1" })} />,
			);
			expect(calls).toHaveLength(0);
			expect(redact).toContain(">Redact</button>");
			expect(redact).not.toContain("<textarea");
			expect(redact).not.toContain("Confirm redaction");
			expect(revoke).toContain(">Revoke strike</button>");
			expect(revoke).not.toContain("Confirm revocation");
		} finally {
			globalThis.fetch = original;
		}
	});
	test("the confirm button stays disabled until the note reaches 10 characters", () => {
		const panel = (note: string) =>
			render(
				<ConfirmNotePanel
					noteLabel="Why"
					confirmLabel="Confirm redaction"
					note={note}
					onNote={() => {}}
					onConfirm={() => {}}
					onCancel={() => {}}
					pending={false}
				/>,
			);
		expect(panel("too short")).toMatch(
			/<button[^>]* disabled=""[^>]*>Confirm redaction<\/button>/,
		);
		expect(panel("long enough note")).not.toMatch(
			/<button[^>]* disabled=""[^>]*>Confirm redaction<\/button>/,
		);
	});
	test("the actions carry the ids and the trimmed note verbatim", () => {
		expect(noteReady("123456789")).toBe(false);
		expect(noteReady("  1234567890  ")).toBe(true);
		expect(redactAction("m1", "  spam content  ")).toEqual({
			action: "redact_message",
			messageId: "m1",
			note: "spam content",
		});
		expect(revokeAction("s1", " issued in error ")).toEqual({
			action: "revoke_strike",
			strikeId: "s1",
			note: "issued in error",
		});
	});
});

const strike = (
	over: Partial<ShopStandingView["strikes"][number]>,
): ShopStandingView["strikes"][number] => ({
	id: "s1",
	kind: "dispute_lost",
	weight: 1,
	status: "active",
	expiresAt: "2027-03-01T00:00:00.000Z",
	sourceType: "dispute",
	createdAt: "2026-09-01T00:00:00.000Z",
	...over,
});

describe("shop strikes", () => {
	test("an admin can revoke an active strike; a moderator and a revoked row cannot", () => {
		const list = (viewerIsAdmin: boolean, status: "active" | "revoked") =>
			render(
				<DisputeStrikes
					disputeId="d1"
					viewerIsAdmin={viewerIsAdmin}
					strikes={[strike({ status })]}
				/>,
			);
		expect(list(true, "active")).toContain(">Revoke strike</button>");
		expect(list(false, "active")).not.toContain("Revoke strike");
		expect(list(true, "revoked")).not.toContain("Revoke strike");
	});
	test("the row shows the kind, status and weight from the server", () => {
		const html = render(
			<DisputeStrikes
				disputeId="d1"
				viewerIsAdmin={false}
				strikes={[
					strike({ kind: "refund_overdue", weight: 2, status: "revoked" }),
				]}
			/>,
		);
		expect(html).toContain('data-status="revoked"');
		expect(html).toContain("Refund overdue");
		expect(html).toContain("Revoked");
		expect(html).toContain("weight 2");
	});
	test("no strikes renders the empty line", () => {
		expect(
			render(<DisputeStrikes disputeId="d1" viewerIsAdmin strikes={[]} />),
		).toContain("No strike on record.");
	});
});
