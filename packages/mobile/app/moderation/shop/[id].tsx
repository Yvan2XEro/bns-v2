import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { DecisionSheet } from "@/src/components/moderation/DecisionSheet";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { ShopActionBar } from "@/src/components/moderation/ShopActionBar";
import { ShopHistoryList } from "@/src/components/moderation/ShopHistoryList";
import { ShopIdentityCard } from "@/src/components/moderation/ShopIdentityCard";
import { ShopSuspensionCard } from "@/src/components/moderation/ShopSuspensionCard";
import { ShopTeamCard } from "@/src/components/moderation/ShopTeamCard";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useModerationShop,
	useSuspendShop,
	useUnsuspendShop,
} from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import {
	availableDurations,
	canActOn,
	SUSPENSION_REASONS,
} from "@/src/lib/moderation";
import type { SuspensionReason } from "@/src/types/api";

export default function ModerateShopScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const c = useModerationTheme();
	const { t } = useTranslation();
	const { user: me } = useAuth();
	const { centeredContent } = useResponsive();
	const { showError, showSuccess, showConfirm } = useAlert();
	const [suspending, setSuspending] = useState(false);

	const { data, isLoading } = useModerationShop(id);
	const { mutate: suspend, isPending: suspendPending } = useSuspendShop();
	const { mutate: unsuspend, isPending: liftPending } = useUnsuspendShop();

	const shop = data?.shop;
	const owner = data?.owner;
	const suspension = data?.suspension;
	// The rank compared is the owner's, as on the API side: a moderator cannot
	// act on a shop owned by another moderator or admin.
	const actionable = canActOn(me, owner);

	const durations = availableDurations(me).map((value) => ({
		value,
		label:
			value === null
				? t("moderation.durationIndefinite")
				: t("moderation.durationDays", { count: value }),
	}));
	const reasons = SUSPENSION_REASONS.map((value) => ({
		value,
		label: t(`report.${value}`),
	}));

	const onSuspend = ({
		choice,
		durationDays,
		text,
	}: {
		choice: string | null;
		durationDays: number | null;
		text: string;
	}) => {
		if (!choice) return;
		suspend(
			{
				shopId: String(id),
				reason: choice as SuspensionReason,
				durationDays,
				note: text || undefined,
			},
			{
				onSuccess: (result) => {
					setSuspending(false);
					showSuccess(
						t("moderation.shopSuspendedTitle"),
						t("moderation.shopSuspendedMessage", {
							count: result.unpublishedListingIds.length,
						}),
					);
				},
				onError: (error) =>
					showError(
						t("moderation.actionFailed"),
						resolveErrorMessage(error, t),
					),
			},
		);
	};

	const onLift = () =>
		showConfirm(
			t("moderation.shopLiftTitle"),
			t("moderation.shopLiftMessage"),
			() =>
				unsuspend(
					{ shopId: String(id) },
					{
						onSuccess: (result) =>
							showSuccess(
								t("moderation.liftedTitle"),
								t("moderation.liftedMessage", {
									count: result.restoredListingIds.length,
								}),
							),
						onError: (error) =>
							showError(
								t("moderation.actionFailed"),
								resolveErrorMessage(error, t),
							),
					},
				),
		);

	return (
		<ModerationScreen title={t("moderation.shopTitle")} subtitle={shop?.name}>
			{isLoading || !data || !shop || !owner || !suspension ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : (
				<>
					<ScrollView
						contentContainerStyle={[
							{ padding: 16, gap: 14, paddingBottom: 24 },
							centeredContent,
						]}
					>
						<ShopIdentityCard
							shop={shop}
							owner={owner}
							counts={data.counts}
							c={c}
							t={t}
						/>
						<ShopSuspensionCard suspension={suspension} c={c} t={t} />
						<ShopTeamCard
							team={data.team}
							activity={data.activity}
							c={c}
							t={t}
						/>
						<ShopHistoryList
							reports={data.reports}
							history={data.history}
							c={c}
							t={t}
						/>
					</ScrollView>

					<ShopActionBar
						actionable={actionable}
						status={shop.status}
						suspendPending={suspendPending}
						liftPending={liftPending}
						onSuspend={() => setSuspending(true)}
						onLift={onLift}
						c={c}
						t={t}
					/>

					<DecisionSheet
						visible={suspending}
						title={t("moderation.shopSuspendSheetTitle")}
						subtitle={t("moderation.shopSuspendSheetSubtitle")}
						choices={reasons}
						choicesLabel={t("moderation.suspendReasonLabel")}
						durations={durations}
						durationsLabel={t("moderation.suspendDurationLabel")}
						textLabel={t("moderation.internalNoteLabel")}
						textPlaceholder={t("moderation.internalNotePlaceholder")}
						confirmLabel={t("moderation.shopConfirmSuspend")}
						destructive
						pending={suspendPending}
						onConfirm={onSuspend}
						onClose={() => setSuspending(false)}
					/>
				</>
			)}
		</ModerationScreen>
	);
}
