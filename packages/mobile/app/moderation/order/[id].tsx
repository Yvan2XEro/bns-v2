import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { EmptyState } from "@/src/components/EmptyState";
import {
	type DecisionResult,
	DecisionSheet,
} from "@/src/components/moderation/DecisionSheet";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import {
	OrderItemsCard,
	OrderTimelineCard,
} from "@/src/components/moderation/OrderItemsTimeline";
import {
	OrderDeliveryCard,
	OrderRiskCard,
	OrderSummaryCard,
} from "@/src/components/moderation/OrderSheetCards";
import { StaffOrderActionBar } from "@/src/components/moderation/StaffOrderActionBar";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useModerationOrder,
	useStaffCancelOrder,
} from "@/src/hooks/useModerationOrder";
import { useOrderReceipt } from "@/src/hooks/usePurchases";
import { useResponsive } from "@/src/hooks/useResponsive";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { shareHtmlDocument } from "@/src/lib/shareHtmlDocument";
import {
	STAFF_CANCEL_REASON_KEYS,
	STAFF_CANCEL_REASONS,
	staffCancelDraft,
	staffSheetActions,
} from "@/src/lib/staffOrderSheet";

/**
 * The staff order sheet: the order's own staff projection, and the one lever
 * a moderator holds on it. Which buttons show is `availableActions`' answer
 * for the staff audience — this screen decides nothing itself.
 */
export default function ModerateOrderScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const c = useModerationTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();
	const { centeredContent } = useResponsive();
	const { showError, showSuccess } = useAlert();
	const [cancelling, setCancelling] = useState(false);

	const sheet = useModerationOrder(id);
	const cancel = useStaffCancelOrder(id);
	// Fetched on tap only: the receipt is HTML behind the caller's token.
	const receipt = useOrderReceipt(id, locale, false);

	const reasons = STAFF_CANCEL_REASONS.map((value) => ({
		value,
		label: t(STAFF_CANCEL_REASON_KEYS[value]),
	}));

	const onCancel = ({ choice, text }: DecisionResult) => {
		const draft = staffCancelDraft(choice, text);
		if (!draft.ok) {
			showError(t("moderation.actionFailed"), t(draft.errorKey));
			return;
		}
		cancel.mutate(draft.input, {
			onSuccess: () => {
				setCancelling(false);
				showSuccess(
					t("moderationOrder.cancelledTitle"),
					t("moderationOrder.cancelledMessage"),
				);
			},
			onError: (error) =>
				showError(t("moderation.actionFailed"), resolveErrorMessage(error, t)),
		});
	};

	const onReceipt = async () => {
		const result = await receipt.refetch();
		if (result.data === undefined || !sheet.data) {
			showError(
				t("moderationOrder.receiptFailed"),
				resolveErrorMessage(result.error, t),
			);
			return;
		}
		try {
			await shareHtmlDocument(
				result.data,
				sheet.data.orderNumber,
				t("moderationOrder.receipt"),
			);
		} catch (error) {
			showError(
				t("moderationOrder.receiptFailed"),
				resolveErrorMessage(error, t),
			);
		}
	};

	const order = sheet.data;
	const actions = order ? staffSheetActions(order) : null;

	return (
		<ModerationScreen
			title={t("moderationOrder.title")}
			subtitle={order?.orderNumber}
		>
			{sheet.isPending ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : sheet.isError || !order || !actions ? (
				<EmptyState
					illustration="notFound"
					title={t("moderationOrder.loadError")}
					subtitle={
						sheet.error ? resolveErrorMessage(sheet.error, t) : undefined
					}
					ctaLabel={t("common.retry")}
					onCta={() => sheet.refetch()}
				/>
			) : (
				<>
					<ScrollView
						contentContainerStyle={[
							{ padding: 16, gap: 14, paddingBottom: 24 },
							centeredContent,
						]}
					>
						<OrderSummaryCard order={order} locale={locale} c={c} t={t} />
						<OrderRiskCard order={order} c={c} t={t} />
						<OrderDeliveryCard order={order} c={c} t={t} />
						<OrderItemsCard order={order} locale={locale} c={c} t={t} />
						<OrderTimelineCard order={order} locale={locale} c={c} t={t} />
					</ScrollView>

					<StaffOrderActionBar
						canCancel={actions.canCancel}
						canReceipt={actions.canReceipt}
						receiptPending={receipt.isFetching}
						onCancel={() => setCancelling(true)}
						onReceipt={onReceipt}
						c={c}
						t={t}
					/>

					<DecisionSheet
						visible={cancelling}
						title={t("moderationOrder.cancelSheetTitle")}
						subtitle={t("moderationOrder.cancelSheetSubtitle")}
						choices={reasons}
						choicesLabel={t("moderationOrder.reasonLabel")}
						textLabel={t("moderationOrder.noteLabel")}
						textPlaceholder={t("moderationOrder.notePlaceholder")}
						confirmLabel={t("moderationOrder.cancel")}
						destructive
						pending={cancel.isPending}
						onConfirm={onCancel}
						onClose={() => setCancelling(false)}
					/>
				</>
			)}
		</ModerationScreen>
	);
}
