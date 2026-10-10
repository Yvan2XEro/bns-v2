import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import { shopOrderShipmentsKey } from "~/lib/query-keys";
import type { ShopShipmentView } from "../../../../../../../api/src/contracts/shipments";
import { order } from "../seller-orders.fixture";
import { ActionBar } from "./action-bar";

const OWNER = { role: "owner" } as const;
const SHIP = "Mark as shipped";
const HANDOVER = "Enter the handover code";
const DECLARE = "Declare delivered";
const FAILED = "Report a failed delivery attempt";
const CANCEL = "Cancel order";

const shipment = (status: ShopShipmentView["status"]): ShopShipmentView => ({
	id: "s-1",
	shipmentNumber: "SHP-1",
	order: "o-1",
	storefrontShop: "shop-1",
	fulfillingShop: "shop-1",
	method: "seller_delivery",
	carrier: "self",
	origin: null,
	destination: { gps: { lat: 4.05, lng: 9.7 } },
	fee: 1_000,
	status,
	createdAt: "2026-10-04T10:00:00.000Z",
	updatedAt: "2026-10-04T10:00:00.000Z",
	riderLink: null,
	proof: null,
	timeline: [],
});

// The real component reads the shipments through its own query hook, so
// seeding that query's cache entry is the only input the test controls.
function bar(
	status: "accepted" | "shipped",
	shipments: ShopShipmentView[] | undefined,
): string {
	const client = new QueryClient();
	if (shipments) {
		client.setQueryData(shopOrderShipmentsKey("shop-1", "o-1"), shipments);
	}
	return renderToStaticMarkup(
		<QueryClientProvider client={client}>
			<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
				<ActionBar
					order={order({ id: "o-1", status })}
					shopId="shop-1"
					{...OWNER}
					roleLoading={false}
					onHandoverFailed={() => {}}
				/>
			</NextIntlClientProvider>
		</QueryClientProvider>,
	);
}

describe("ActionBar derives liveShipment from the order's shipments", () => {
	test("no shipment data keeps the legacy buttons", () => {
		const html = bar("shipped", undefined);
		expect(html).toContain(`>${HANDOVER}<`);
		expect(html).toContain(`>${DECLARE}<`);
		expect(bar("accepted", undefined)).toContain(`>${SHIP}<`);
	});
	test("a live shipment reaches the filter and hides the three panel-owned buttons", () => {
		const shipped = bar("shipped", [shipment("in_transit")]);
		expect(shipped).not.toContain(HANDOVER);
		expect(shipped).not.toContain(DECLARE);
		expect(shipped).toContain(`>${FAILED}<`);
		const accepted = bar("accepted", [shipment("pending")]);
		expect(accepted).not.toContain(`>${SHIP}<`);
		expect(accepted).toContain(`>${CANCEL}<`);
	});
	test("a cancelled shipment is not live, the buttons come back", () => {
		const html = bar("shipped", [shipment("cancelled")]);
		expect(html).toContain(`>${HANDOVER}<`);
		expect(html).toContain(`>${DECLARE}<`);
	});
	test("one live shipment among cancelled ones is enough", () => {
		const html = bar("shipped", [
			shipment("cancelled"),
			shipment("in_transit"),
		]);
		expect(html).not.toContain(HANDOVER);
	});
});
