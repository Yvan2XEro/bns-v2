import { router, useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useShopActivity } from "@/src/hooks/useShopActivity";
import { useMyShop } from "@/src/hooks/useShops";
import {
	useChangeMemberRole,
	useRemoveMember,
	useShopTeam,
} from "@/src/hooks/useShopTeam";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { can } from "@/src/lib/shopRoles";
import { memberActions } from "@/src/lib/teamForm";
import type { ShopActivityView, TeamMemberView } from "@/src/types/api";

const ROLE_KEY: Record<TeamMemberView["role"], string> = {
	owner: "team.roleOwner",
	manager: "team.roleManager",
	staff: "team.roleStaff",
};

/** `"member.joined"` → "Joined" — a generic formatter, not a per-action table: that richer mapping belongs to the activity feed screen. */
function formatAction(action: ShopActivityView["action"]): string {
	const [, verb] = action.split(".");
	return (verb ?? action).replace(/_/g, " ");
}

export default function MemberDetailScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { showError, showConfirm } = useAlert();
	const { memberId } = useLocalSearchParams<{ memberId: string }>();
	const myShop = useMyShop();
	const shop = myShop.data?.shop;
	const role = myShop.data?.role ?? null;
	const team = useShopTeam(shop?.id);
	const changeRole = useChangeMemberRole(shop?.id ?? "");
	const removeMember = useRemoveMember(shop?.id ?? "");

	const member = team.data?.members.find((m) => m.id === memberId);
	const canViewActivity = can(role, "activity.view") && Boolean(member);
	const activity = useShopActivity(
		canViewActivity ? shop?.id : undefined,
		member ? { actor: member.userId } : {},
	);

	const isLoading = myShop.isPending || (Boolean(shop?.id) && team.isPending);
	const isError = myShop.isError || (Boolean(shop?.id) && team.isError);
	const locale = i18n.language?.startsWith("en") ? "en-GB" : "fr-FR";

	const onToggleRole = (member: TeamMemberView) => {
		const next = member.role === "manager" ? "staff" : "manager";
		changeRole.mutate(
			{ memberId: member.id, role: next },
			{
				onError: (error) =>
					showError(t("team.actionErrorTitle"), resolveErrorMessage(error, t)),
			},
		);
	};

	const onRemove = (member: TeamMemberView) => {
		showConfirm(
			t("team.remove"),
			t("team.removeConfirmMessage", { name: member.name ?? "" }),
			() => {
				removeMember.mutate(member.id, {
					onSuccess: () => router.back(),
					onError: (error) =>
						showError(
							t("team.actionErrorTitle"),
							resolveErrorMessage(error, t),
						),
				});
			},
		);
	};

	const joined = member
		? formatDate(
				member.joinedAt,
				{ day: "numeric", month: "short", year: "numeric" },
				locale,
			)
		: null;

	const entries = (activity.data?.pages[0]?.docs ?? []).slice(0, 10);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("team.memberDetail")} />

			{isLoading ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : isError || !member ? (
				<EmptyState
					illustration="notFound"
					title={t("team.errorTitle")}
					ctaLabel={t("common.back")}
					onCta={() => router.back()}
				/>
			) : (
				<ScrollView contentContainerStyle={styles.content}>
					<View style={styles.profile}>
						<ShopAvatar
							name={member.name ?? t("team.noName")}
							logo={member.avatarUrl}
							size={56}
							radius={28}
						/>
						<Text style={[styles.name, { color: c.text }]}>
							{member.name ?? t("team.noName")}
						</Text>
						<Text style={[styles.meta, { color: c.muted }]}>
							{t(ROLE_KEY[member.role])}
							{joined ? ` · ${t("team.joined", { date: joined })}` : ""}
						</Text>
						{member.suspended ? (
							<View style={[styles.chip, { backgroundColor: c.dangerSoft }]}>
								<Text style={[styles.chipText, { color: c.dangerText }]}>
									{t("team.suspended")}
								</Text>
							</View>
						) : null}
					</View>

					{memberActions(role, member).canChangeRole ? (
						<View
							style={[
								styles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<Text style={[styles.cardTitle, { color: c.text }]}>
								{t("team.changeRole")}
							</Text>
							<View style={styles.roleRow}>
								{(["manager", "staff"] as const).map((option) => {
									const active = member.role === option;
									return (
										<Pressable
											key={option}
											onPress={() => !active && onToggleRole(member)}
											disabled={active || changeRole.isPending}
											accessibilityRole="button"
											accessibilityState={{ selected: active }}
											accessibilityLabel={t(ROLE_KEY[option])}
											style={[
												styles.roleChip,
												{
													borderColor: active ? c.primary : c.border,
													backgroundColor: active ? c.primarySoft : c.card,
												},
											]}
										>
											<Text
												style={[
													styles.roleChipText,
													{ color: active ? c.primary : c.body },
												]}
											>
												{t(ROLE_KEY[option])}
											</Text>
										</Pressable>
									);
								})}
							</View>
						</View>
					) : null}

					{memberActions(role, member).canRemove ? (
						<Pressable
							onPress={() => onRemove(member)}
							disabled={removeMember.isPending}
							accessibilityRole="button"
							accessibilityLabel={t("team.remove")}
							style={[styles.removeBtn, { borderColor: c.danger }]}
						>
							<Text style={[styles.removeText, { color: c.danger }]}>
								{t("team.remove")}
							</Text>
						</Pressable>
					) : null}

					{canViewActivity ? (
						<View style={styles.activitySection}>
							<Text style={[styles.cardTitle, { color: c.text }]}>
								{t("team.recentActivity")}
							</Text>
							{entries.length === 0 ? (
								<Text style={[styles.meta, { color: c.muted }]}>
									{t("team.activityEmpty")}
								</Text>
							) : (
								<View style={{ gap: 8 }}>
									{entries.map((entry) => (
										<View
											key={entry.id}
											style={[
												styles.activityRow,
												{ backgroundColor: c.card, borderColor: c.border },
											]}
										>
											<Text style={[styles.activityAction, { color: c.text }]}>
												{formatAction(entry.action)}
											</Text>
											<Text style={[styles.meta, { color: c.muted }]}>
												{formatDate(
													entry.createdAt,
													{
														day: "numeric",
														month: "short",
														hour: "2-digit",
														minute: "2-digit",
													},
													locale,
												)}
											</Text>
										</View>
									))}
								</View>
							)}
						</View>
					) : null}
				</ScrollView>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 16, gap: 20, paddingBottom: 40 },
	profile: { alignItems: "center", gap: 6 },
	name: { fontSize: 18, fontFamily: Fonts.displayBold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	chip: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 3,
		marginTop: 4,
	},
	chipText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
	cardTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	roleRow: { flexDirection: "row", gap: 8 },
	roleChip: {
		minHeight: 44,
		paddingHorizontal: 16,
		borderRadius: 999,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	roleChipText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	removeBtn: {
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	removeText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	activitySection: { gap: 8 },
	activityRow: {
		minHeight: 44,
		padding: 12,
		borderRadius: 14,
		borderWidth: 1,
		gap: 2,
	},
	activityAction: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
		textTransform: "capitalize",
	},
});
