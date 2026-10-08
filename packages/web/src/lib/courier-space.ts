import type { CourierShipmentRow } from "../../../api/src/contracts/shipments";
import type { CourierMember, User } from "../../../api/src/payload-types";
import { districtName } from "./delivery-zone-form";
import { shipmentDestination } from "./shipment-panel";

/** The statuses `GET /api/courier/shipments?status=` accepts; `all` sends none. */
export const COURIER_TABS = [
	"all",
	"pending",
	"picked_up",
	"in_transit",
	"failed",
	"delivered",
	"returned",
] as const;
export type CourierTab = (typeof COURIER_TABS)[number];

export function tabStatus(tab: CourierTab): string | undefined {
	return tab === "all" ? undefined : tab;
}

export type CourierRowAction = "assign_rider" | "declare_remittance";

const LIVE: readonly CourierShipmentRow["status"][] = [
	"pending",
	"picked_up",
	"in_transit",
	"failed",
];

/**
 * Both actions are the dispatcher's alone (`assign` and `cod-remitted` answer
 * `shipment.notAssigned` to anyone else), so a rider's rows carry none. A
 * remittance can be declared once the cash is `pending`, which is only ever
 * set at a delivery.
 */
export function courierRowActions(
	row: Pick<CourierShipmentRow, "status" | "courierId" | "codCollection">,
	dispatcherOf: ReadonlySet<string>,
): CourierRowAction[] {
	if (!row.courierId || !dispatcherOf.has(row.courierId)) return [];
	const actions: CourierRowAction[] = [];
	if (LIVE.includes(row.status)) actions.push("assign_rider");
	if (row.codCollection?.remittanceStatus === "pending") {
		actions.push("declare_remittance");
	}
	return actions;
}

export function dispatcherCourierIds(
	memberships: readonly CourierMember[],
): Set<string> {
	return new Set(
		memberships.flatMap((member) =>
			member.role === "dispatcher" && member.status === "active"
				? [
						typeof member.courier === "string"
							? member.courier
							: member.courier.id,
					]
				: [],
		),
	);
}

export interface RiderOption {
	userId: string;
	label: string;
	/** The assign route refuses a rider who has not shared their phone. */
	assignable: boolean;
}

const memberUser = (user: string | User) =>
	typeof user === "string" ? { id: user, name: null } : user;

export function riderOptions(
	members: readonly CourierMember[],
	courierId: string,
): RiderOption[] {
	return members.flatMap((member) => {
		const owner =
			typeof member.courier === "string" ? member.courier : member.courier.id;
		if (
			owner !== courierId ||
			member.role !== "rider" ||
			member.status !== "active"
		) {
			return [];
		}
		const user = memberUser(member.user);
		return [
			{
				userId: user.id,
				label: user.name ?? user.id,
				assignable: Boolean(member.phoneSharingConsentAt),
			},
		];
	});
}

export interface RowSummary {
	number: string;
	where: string;
	riderName: string | null;
	expectedCod: number | null;
}

/** What the list shows of a row: the recipient's name and phone stay out of it. */
export function rowSummary(row: CourierShipmentRow): RowSummary {
	const destination = shipmentDestination({ destination: row.destination });
	return {
		number: row.shipmentNumber,
		where: [
			destination.landmark,
			destination.district ? districtName(destination.district) : null,
			destination.city,
		]
			.filter(Boolean)
			.join(", "),
		riderName: row.rider?.name ?? null,
		expectedCod: row.codCollection?.expectedAmount ?? null,
	};
}
