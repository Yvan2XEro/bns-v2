import type { Payload } from "payload";
import type { Courier } from "../../payload-types";
import {
	CourierCapabilityError,
	CourierUnavailableError,
} from "./providerErrors";
import type {
	CourierProvider,
	CourierQuote,
	CourierQuoteParams,
	CourierStatusSnapshot,
	CreateCourierShipmentParams,
} from "./types";

export class ManualCourierProvider implements CourierProvider {
	readonly id = "manual" as const;
	readonly capabilities: CourierProvider["capabilities"];

	constructor(
		private readonly courier: Courier,
		private readonly payload: Payload,
	) {
		this.capabilities = {
			quote: true,
			webhooks: false,
			cancel: true,
			cod: courier.supportsCod === true,
			intercity: courier.scopes.includes("intercity"),
		};
	}

	async quote(params: CourierQuoteParams): Promise<CourierQuote> {
		const rows = (this.courier.tariffs ?? []).filter(
			(row) => row.city === params.destination.city,
		);
		const districtRow = rows.find(
			(row) => row.district === params.destination.district,
		);
		const cityRow = rows.find((row) => !row.district);
		const tariff = districtRow ?? cityRow;
		if (!tariff) throw new CourierUnavailableError(this.courier.key);
		return {
			amount: tariff.amount,
			currency: "XAF",
			etaMinHours: tariff.etaMinHours,
			etaMaxHours: tariff.etaMaxHours,
		};
	}

	async create(params: CreateCourierShipmentParams): Promise<{
		providerShipmentId: string;
		status: "pending";
		trackingCode: string;
		trackingUrl?: string;
	}> {
		const trackingCode = params.reference;
		const template = this.courier.trackingUrlTemplate;
		return {
			providerShipmentId: params.reference,
			status: "pending",
			trackingCode,
			...(template
				? {
						trackingUrl: template.replaceAll(
							"{trackingCode}",
							encodeURIComponent(trackingCode),
						),
					}
				: {}),
		};
	}

	async cancel(params: {
		providerShipmentId: string;
		reason: string;
	}): Promise<{ cancelled: boolean }> {
		const shipment = await this.payload.findByID({
			collection: "shipments",
			id: params.providerShipmentId,
			depth: 0,
			overrideAccess: true,
		});
		return { cancelled: shipment.status === "pending" };
	}

	async verifyWebhook(
		_rawBody: string,
		_headers: Record<string, string | undefined>,
	): Promise<never> {
		throw new CourierCapabilityError("manual", "verifyWebhook");
	}

	async getStatus(providerShipmentId: string): Promise<CourierStatusSnapshot> {
		const shipment = await this.payload.findByID({
			collection: "shipments",
			id: providerShipmentId,
			depth: 0,
			overrideAccess: true,
		});
		return {
			reference: String(shipment.id),
			providerShipmentId: String(shipment.id),
			providerStatus: shipment.status,
			status: shipment.status,
			occurredAt: new Date(shipment.updatedAt),
		};
	}
}
