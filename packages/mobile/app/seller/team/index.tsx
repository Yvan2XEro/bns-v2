import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { fillOf } from "@/src/components/shop/ink";
import { ListSkeleton } from "@/src/components/shop/ListSkeleton";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { MemberRow } from "@/src/components/shop/team/MemberRow";
import { PendingInvitationRow } from "@/src/components/shop/team/PendingInvitationRow";
import { RoleMatrix } from "@/src/components/shop/team/RoleMatrix";
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
				<ListSkeleton />
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
				<ScreenColumn width="wide">
					<FlashList
						data={view.members}
						keyExtractor={(member) => member.id}
						contentContainerStyle={styles.list}
						ListHeaderComponent={
							<TeamHeader view={view} canInvite={canInvite} isFull={isFull} />
						}
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
								resendingId={resendingId}
								revokingId={revokingId}
								onResend={handleResend}
								onRevoke={handleRevoke}
							/>
						}
					/>
				</ScreenColumn>
			)}
		</SafeAreaView>
	);
}

/**
 * The seats, then the screen's one primary action: inviting sits above the
 * roster so it is reachable without scrolling past every member.
 */
function TeamHeader({
	view,
	canInvite,
	isFull,
}: {
	view: TeamView;
	canInvite: boolean;
	isFull: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View style={styles.header}>
			<TeamLimitMeter team={view} />
			{canInvite ? (
				<View style={styles.inviteWrap}>
					<Pressable
						onPress={() => router.push("/seller/team/invite" as never)}
						disabled={isFull}
						accessibilityRole="button"
						accessibilityLabel={t("team.invite")}
						accessibilityState={{ disabled: isFull }}
						style={({ pressed }) => [
							styles.inviteBtn,
							{
								backgroundColor: fillOf(c),
								opacity: isFull ? 0.5 : pressed ? 0.85 : 1,
							},
						]}
					>
						<Ionicons name="person-add-outline" size={18} color="#fff" />
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

/**
 * Pending invitations never reach the dozens this screen's roster could, so
 * they render through a plain map in the member `FlashList`'s footer rather
 * than a second, nested `FlashList` — React Native does not virtualize a
 * `FlashList` inside another list's footer safely.
 */
function PendingSection({
	view,
	role,
	resendingId,
	revokingId,
	onResend,
	onRevoke,
}: {
	view: TeamView;
	role: ShopRole | null;
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
			<Text
				accessibilityRole="header"
				style={[styles.sectionTitle, { color: c.text }]}
			>
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

			{/* What each role may do: reference, so it comes after the actions. */}
			<View style={styles.matrix}>
				<RoleMatrix />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	list: { padding: 16, paddingBottom: 40, gap: 0 },
	header: { gap: 12, marginBottom: 16 },
	footer: { marginTop: 28, gap: 10 },
	sectionTitle: {
		fontSize: 19,
		lineHeight: 24,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.3,
	},
	matrix: { marginTop: 28 },
	meta: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	inviteWrap: { gap: 8 },
	inviteBtn: {
		flexDirection: "row",
		gap: 8,
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	inviteText: { color: "#fff", fontSize: 16, fontFamily: Fonts.bodyBold },
});
