import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import { caseKeys } from "~/lib/query-keys";
import type {
	ReturnAction,
	ReturnCaseView,
} from "../../../../../api/src/contracts/returns";
import { ReturnCaseClient } from "./return-case-client";

const view = (allowedActions: ReturnAction[]): ReturnCaseView => ({
	id: "ret-1",
	number: "RET-001",
	orderId: "order-1",
	orderNumber: "ORD-001",
	basis: "withdrawal",
	status: "awaiting_shipment",
	returnRequired: true,
	returnMethod: "buyer_drop_off",
	returnTracking: null,
	items: [],
	reasonText: null,
	deadlines: {
		requestDeadline: null,
		shipBy: null,
		pickupBy: null,
		inspectBy: null,
		deductionRespondBy: null,
		refundBy: null,
	},
	returnShippingPaidBy: "buyer",
	refund: {
		amount: 0,
		breakdown: {
			goods: 0,
			outboundDelivery: 0,
			returnShipping: 0,
			buyerProtectionFee: 0,
			deduction: 0,
		},
		channel: null,
		providerRefundStatus: null,
		sellerProof: null,
		buyerConfirmedAt: null,
		contestedAt: null,
	},
	disputeId: null,
	rejectionReason: null,
	timeline: [],
	allowedActions,
});

function render(surface: "buyer" | "seller", actions: ReturnAction[]) {
	const client = new QueryClient();
	client.setQueryData(caseKeys.returnDetail("ret-1"), view(actions));
	return renderToStaticMarkup(
		<QueryClientProvider client={client}>
			<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
				<ReturnCaseClient caseId="ret-1" surface={surface} />
			</NextIntlClientProvider>
		</QueryClientProvider>,
	);
}

const BRIDGE = "Open in your seller space";

describe("ReturnCaseClient surfaces", () => {
	test("buyer: back to account returns, no workspace breadcrumb", () => {
		const html = render("buyer", ["ship", "cancel"]);
		expect(html).toContain('href="/account/returns"');
		expect(html).not.toContain('href="/seller/returns"');
		expect(html).not.toContain(BRIDGE);
	});
	test("buyer on the shop side gets the soft bridge to the workspace", () => {
		const html = render("buyer", ["inspect"]);
		expect(html).toContain(BRIDGE);
		expect(html).toContain('href="/seller/returns/ret-1"');
	});
	test("seller: workspace breadcrumb with the fetched number, no buyer back-link, no bridge", () => {
		const html = render("seller", ["inspect"]);
		expect(html).toContain('href="/seller/returns"');
		expect(html).toContain("RET-001</span>");
		expect(html).not.toContain('href="/account/returns"');
		expect(html).not.toContain(BRIDGE);
	});
});
