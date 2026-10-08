import { useReducer } from "react";
import { Text, View } from "react-native";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveCouriers } from "@/src/hooks/useDeliverySettings";
import {
	useCodRemittance,
	useMarkReturned,
	useReadyForPickup,
	useRevokeRiderLink,
	useSellerReschedule,
	useStartShipment,
	useSwitchCarrier,
} from "@/src/hooks/useShipmentActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { readDestination } from "@/src/lib/riderShipment";
import {
	type ShipmentAction,
	visibleShipmentActions,
} from "@/src/lib/shipmentActions";
import { type DeliveryWindow, WINDOW_LABELS } from "@/src/lib/shipmentStatus";
import { rescheduleDays } from "@/src/lib/shipmentTracking";
import type { ShopShipmentView } from "../../../../api/src/contracts/shipments";
import { ChoiceField } from "./FormFields";
import {
	AttemptPanel,
	DeclareDeliveredPanel,
	HandoverPanel,
	RiderPanel,
} from "./ShipmentPanels";

type Panel =
	| "attempt"
	| "declare"
	| "handover"
	| "rider"
	| "carrier"
	| "reschedule"
	| null;
interface State {
	panel: Panel;
	date: string;
	window: DeliveryWindow;
}

const LABEL: Record<ShipmentAction, string> = {
	start: "shipmentPanel.start",
	ready_for_pickup: "shipmentPanel.readyForPickup",
	handover: "shipmentPanel.handover",
	attempt: "shipmentPanel.attempt",
	declare_delivered: "shipmentPanel.declareDelivered",
	returned: "shipmentPanel.returned",
	reschedule: "shipmentPanel.reschedule",
	assign_rider: "shipmentPanel.assignRider",
	rider_link: "shipmentPanel.assignRider",
	revoke_rider_link: "shipmentPanel.revokeLink",
	switch_carrier: "shipmentPanel.switchCarrier",
	confirm_remittance: "shipmentPanel.confirmRemittance",
	dispute_remittance: "shipmentPanel.disputeRemittance",
};

/** The panel each action opens; the rest act at once. */
const PANEL_OF: Partial<Record<ShipmentAction, Exclude<Panel, null>>> = {
	attempt: "attempt",
	declare_delivered: "declare",
	handover: "handover",
	assign_rider: "rider",
	rider_link: "rider",
	switch_carrier: "carrier",
	reschedule: "reschedule",
};

function Mutating({ error }: { error: unknown }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	if (!error) return null;
	return (
		<Text accessibilityRole="alert" style={{ color: c.danger }}>
			{resolveErrorMessage(error, t, t("shipmentPanel.actionFailed"))}
		</Text>
	);
}

export function SellerShipmentActions({
	view,
	canProcess,
	canSeeCosts,
}: {
	view: ShopShipmentView;
	canProcess: boolean;
	canSeeCosts: boolean;
}) {
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const id = String(view.id);
	const days = rescheduleDays(new Date());
	const [state, patch] = useReducer(
		(s: State, p: Partial<State>) => ({ ...s, ...p }),
		{
			panel: null,
			date: days[0]?.iso ?? "",
			window: "morning",
		} satisfies State,
	);
	const start = useStartShipment(id);
	const ready = useReadyForPickup(id);
	const returned = useMarkReturned(id);
	const revoke = useRevokeRiderLink(id);
	const remittance = useCodRemittance(id);
	const carrier = useSwitchCarrier(id);
	const reschedule = useSellerReschedule(id);
	const city = readDestination(view.destination).city ?? "";
	const couriers = useActiveCouriers(
		city,
		state.panel === "carrier" && city !== "",
	);

	const actions = visibleShipmentActions(view, { canProcess, canSeeCosts });
	const close = () => patch({ panel: null });
	const run: Partial<Record<ShipmentAction, () => void>> = {
		start: () => start.mutate(),
		ready_for_pickup: () => ready.mutate(),
		returned: () => returned.mutate({}),
		revoke_rider_link: () => revoke.mutate(),
		confirm_remittance: () => remittance.mutate({ action: "confirm" }),
		dispute_remittance: () => remittance.mutate({ action: "dispute" }),
	};
	const dayLabel = (iso: string) =>
		new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
			weekday: "short",
			day: "numeric",
			month: "short",
			timeZone: "Africa/Douala",
		}).format(new Date(iso));

	const known =
		view.rider?.name && view.rider.phone
			? { name: view.rider.name, phone: view.rider.phone }
			: null;

	return (
		<View style={{ gap: 12 }}>
			{actions.map((action) => (
				<SheetButton
					key={action}
					label={t(LABEL[action])}
					tone={action === "dispute_remittance" ? "danger" : "primary"}
					pending={
						(action === "start" && start.isPending) ||
						(action === "ready_for_pickup" && ready.isPending) ||
						(action === "returned" && returned.isPending) ||
						(action === "revoke_rider_link" && revoke.isPending) ||
						(action.endsWith("_remittance") && remittance.isPending)
					}
					onPress={() => {
						const panel = PANEL_OF[action];
						if (panel) patch({ panel: state.panel === panel ? null : panel });
						else run[action]?.();
					}}
				/>
			))}
			<Mutating
				error={
					start.error ??
					ready.error ??
					returned.error ??
					revoke.error ??
					remittance.error
				}
			/>
			{state.panel === "attempt" ? (
				<AttemptPanel shipmentId={id} onDone={close} />
			) : null}
			{state.panel === "declare" ? (
				<DeclareDeliveredPanel shipmentId={id} onDone={close} />
			) : null}
			{state.panel === "handover" ? (
				<HandoverPanel shipmentId={id} onDone={close} />
			) : null}
			{state.panel === "rider" ? (
				<RiderPanel shipmentId={id} known={known} onDone={close} />
			) : null}
			{state.panel === "carrier" ? (
				<View style={{ gap: 10 }}>
					<SheetButton
						label={t("shipmentPanel.carrierSelf")}
						tone="secondary"
						pending={carrier.isPending}
						onPress={() =>
							carrier.mutate({ carrier: "self" }, { onSuccess: close })
						}
					/>
					{(couriers.data ?? []).map((courier) => (
						<SheetButton
							key={courier.id}
							label={courier.name}
							tone="secondary"
							pending={carrier.isPending}
							onPress={() =>
								carrier.mutate(
									{ carrier: "courier", courierId: courier.id },
									{ onSuccess: close },
								)
							}
						/>
					))}
					<Mutating error={carrier.error} />
				</View>
			) : null}
			{state.panel === "reschedule" ? (
				<View style={{ gap: 12 }}>
					<ChoiceField
						label={t("tracking.rescheduleDate")}
						options={days.map((day) => day.iso)}
						value={state.date}
						onChange={(date) => patch({ date })}
						labelOf={dayLabel}
					/>
					<ChoiceField
						label={t("tracking.rescheduleWindow")}
						options={["morning", "afternoon", "evening"] as const}
						value={state.window}
						onChange={(window) => patch({ window })}
						labelOf={(w) => t(WINDOW_LABELS[w])}
					/>
					<Mutating error={reschedule.error} />
					<SheetButton
						label={t("tracking.rescheduleSubmit")}
						pending={reschedule.isPending}
						onPress={() =>
							reschedule.mutate(
								{ date: state.date, window: state.window },
								{ onSuccess: close },
							)
						}
					/>
				</View>
			) : null}
		</View>
	);
}
