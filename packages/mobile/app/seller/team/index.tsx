import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { MemberRow } from "@/src/components/shop/team/MemberRow";
import { PendingInvitationRow } from "@/src/components/shop/team/PendingInvitationRow";
import { TeamLimitMeter } from "@/src/components/shop/team/TeamLimitMeter";
import { TeamLocked } from "@/src/components/shop/team/TeamLocked";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useMyShop } from "@/src/hooks/useShops";
import {
	useResendInvitation,
	useRevokeInvitation,
	useShopTeam,
} from "@/src/hooks/useShopTeam";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { assignableRoles, seatSummary } from "@/src/lib/teamForm";
import type {
	PendingInvitationView,
	ShopRole,
	TeamView,
} from "@/src/types/api";

export default function TeamScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showError, showConfirm } = useAlert();
	const myShop = useMyShop();
	const shop = myShop.data?.shop;
	const role = myShop.data?.role ?? null;
	const team = useShopTeam(shop?.id);
	const resendInvitation = useResendInvitation(shop?.id ?? "");
	const revokeInvitation = useRevokeInvitation(shop?.id ?? "");
	const [resendingId, setResendingId] = useState<string | null>(null);
	const [revokingId, setRevokingId] = useState<string | null>(null);

	const isLoading = myShop.isPending || (Boolean(shop?.id) && team.isPending);
	const isError = myShop.isError || (Boolean(shop?.id) && team.isError);
	const view = team.data;
	const canInvite = assignableRoles(role).length > 0;
	const isFull = view
		? seatSummary(view).used >= seatSummary(view).total
		: false;

	const handleResend = (invitation: PendingInvitationView) => {
		setResendingId(invitation.id);
		resendInvitation.mutate(invitation.id, {
			onSuccess: (result) => {
				if (!result.delivered) {
					showError(t("team.inviteFailedTitle"), t("team.deliveredFalse"));
				}
			},
			onError: (error) =>
				showError(t("team.actionErrorTitle"), resolveErrorMessage(error, t)),
			onSettled: () => setResendingId(null),
		});
	};

	const handleRevoke = (invitation: PendingInvitationView) => {
		showConfirm(
			t("team.revoke"),
			t("team.revokeConfirmMessage", { target: invitation.maskedTarget }),
			() => {
				setRevokingId(invitation.id);
				revokeInvitation.mutate(invitation.id, {
					onError: (error) =>
						showError(
							t("team.actionErrorTitle"),
							resolveErrorMessage(error, t),
						),
					onSettled: () => setRevokingId(null),
				});
			},
		);
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("team.title")} />

			{isLoading ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : isError ? (
				<EmptyState
					illustration="notFound"
					title={t("team.errorTitle")}
					ctaLabel={t("common.retry")}
					onCta={() => {
						void myShop.refetch();
						void team.refetch();
					}}
				/>
			) : !shop ? (
				<EmptyState
					illustration="sell"
					title={t("seller.noShopTitle")}
					subtitle={t("seller.noShopSubtitle")}
					ctaLabel={t("account.openShop")}
					onCta={() => router.replace("/shop/create" as never)}
				/>
			) : !view ? null : !view.teamMembers ? (
				<TeamLocked />
			) : (
				<FlashList
					data={view.members}
					keyExtractor={(member) => member.id}
					contentContainerStyle={styles.list}
					ListHeaderComponent={<TeamLimitMeter team={view} />}
					renderItem={({ item }) => (
						<MemberRow
							member={item}
							onPress={() => router.push(`/seller/team/${item.id}` as never)}
						/>
					)}
					ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
					ListFooterComponent={
						<PendingSection
							view={view}
							role={role}
							canInvite={canInvite}
							isFull={isFull}
							resendingId={resendingId}
							revokingId={revokingId}
							onResend={handleResend}
							onRevoke={handleRevoke}
						/>
					}
				/>
			)}
		</SafeAreaView>
	);
}

/**
 * Pending invitations never reach the dozens this screen's roster could, so
 * they render through a plain map in the member `FlashList`'s footer rather
 * than a second, nested `FlashList` — React Native does not virtualize a
 * `FlashList` inside another list's footer safely.
 */
function PendingSection({
	view,
	role,
	canInvite,
	isFull,
	resendingId,
	revokingId,
	onResend,
	onRevoke,
}: {
	view: TeamView;
	role: ShopRole | null;
	canInvite: boolean;
	isFull: boolean;
	resendingId: string | null;
	revokingId: string | null;
	onResend: (invitation: PendingInvitationView) => void;
	onRevoke: (invitation: PendingInvitationView) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const allowedRoles = assignableRoles(role);

	return (
		<View style={styles.footer}>
			<Text style={[styles.sectionTitle, { color: c.text }]}>
				{t("team.pending")}
			</Text>
			{view.invitations.length === 0 ? (
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("team.pendingEmpty")}
				</Text>
			) : (
				<View style={{ gap: 8 }}>
					{view.invitations.map((invitation) => (
						<PendingInvitationRow
							key={invitation.id}
							invitation={invitation}
							canManage={allowedRoles.includes(invitation.role)}
							onResend={() => onResend(invitation)}
							onRevoke={() => onRevoke(invitation)}
							resending={resendingId === invitation.id}
							revoking={revokingId === invitation.id}
						/>
					))}
				</View>
			)}

			{canInvite ? (
				<View style={styles.inviteWrap}>
					<Pressable
						onPress={() => router.push("/seller/team/invite" as never)}
						disabled={isFull}
						accessibilityRole="button"
						accessibilityLabel={t("team.invite")}
						style={[
							styles.inviteBtn,
							{ backgroundColor: c.primary, opacity: isFull ? 0.5 : 1 },
						]}
					>
						<Text style={styles.inviteText}>{t("team.invite")}</Text>
					</Pressable>
					{isFull ? (
						<Text style={[styles.meta, { color: c.warningText }]}>
							{t("team.inviteFull")}
						</Text>
					) : null}
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	list: { padding: 16, paddingBottom: 40, gap: 0 },
	footer: { marginTop: 20, gap: 8 },
	sectionTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	inviteWrap: { marginTop: 12, gap: 6 },
	inviteBtn: {
		minHeight: 44,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	inviteText: { color: "#fff", fontSize: 15, fontFamily: Fonts.bodySemibold },
});
