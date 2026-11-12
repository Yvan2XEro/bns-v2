import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { dangerInk } from "@/src/components/shop/ink";
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
				<DetailSkeleton cards={2} />
			) : isError || !member ? (
				<EmptyState
					illustration="notFound"
					title={t("team.errorTitle")}
					ctaLabel={t("common.back")}
					onCta={() => router.back()}
				/>
			) : (
				<ScreenColumn width="reading">
					<ScrollView contentContainerStyle={styles.content}>
						<View style={styles.profile}>
							<ShopAvatar
								name={member.name ?? t("team.noName")}
								logo={member.avatarUrl}
								size={64}
								radius={32}
							/>
							<Text
								accessibilityRole="header"
								style={[styles.name, { color: c.text }]}
							>
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
							<View style={styles.section}>
								<Text
									accessibilityRole="header"
									style={[styles.sectionTitle, { color: c.text }]}
								>
									{t("team.changeRole")}
								</Text>
								<View
									accessibilityRole="radiogroup"
									style={[styles.segment, { backgroundColor: c.neutralSoft }]}
								>
									{(["manager", "staff"] as const).map((option) => {
										const active = member.role === option;
										return (
											<Pressable
												key={option}
												onPress={() => !active && onToggleRole(member)}
												disabled={active || changeRole.isPending}
												accessibilityRole="radio"
												accessibilityState={{
													checked: active,
													disabled: changeRole.isPending,
												}}
												accessibilityLabel={t(ROLE_KEY[option])}
												style={({ pressed }) => [
													styles.segmentItem,
													active && { backgroundColor: c.card },
													active && styles.segmentActive,
													pressed && !active && styles.pressed,
												]}
											>
												<Text
													style={[
														styles.segmentText,
														{ color: active ? c.text : c.body },
														active && styles.segmentTextActive,
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

						{canViewActivity ? (
							<View style={styles.section}>
								<Text
									accessibilityRole="header"
									style={[styles.sectionTitle, { color: c.text }]}
								>
									{t("team.recentActivity")}
								</Text>
								{entries.length === 0 ? (
									<Text style={[styles.meta, { color: c.muted }]}>
										{t("team.activityEmpty")}
									</Text>
								) : (
									<View
										style={[
											styles.group,
											{ backgroundColor: c.card, borderColor: c.border },
										]}
									>
										{entries.map((entry, index) => (
											<View
												key={entry.id}
												style={[
													styles.activityRow,
													index > 0 && {
														borderTopWidth: StyleSheet.hairlineWidth,
														borderTopColor: c.border,
													},
												]}
											>
												<Text
													style={[styles.activityAction, { color: c.text }]}
												>
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

						{/* Destructive, so it closes the page rather than leading it. */}
						{memberActions(role, member).canRemove ? (
							<Pressable
								onPress={() => onRemove(member)}
								disabled={removeMember.isPending}
								accessibilityRole="button"
								accessibilityLabel={t("team.remove")}
								accessibilityState={{ disabled: removeMember.isPending }}
								style={({ pressed }) => [
									styles.removeBtn,
									{ borderColor: c.danger },
									(pressed || removeMember.isPending) && styles.pressed,
								]}
							>
								<Ionicons
									name="person-remove-outline"
									size={18}
									color={dangerInk(c)}
								/>
								<Text style={[styles.removeText, { color: dangerInk(c) }]}>
									{t("team.remove")}
								</Text>
							</Pressable>
						) : null}
					</ScrollView>
				</ScreenColumn>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 16, gap: 28, paddingBottom: 48 },
	profile: { alignItems: "center", gap: 6, paddingTop: 8 },
	name: {
		fontSize: 24,
		lineHeight: 32,
		letterSpacing: -0.5,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
		marginTop: 6,
	},
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	chip: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 4,
		marginTop: 4,
	},
	chipText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
	section: { gap: 10 },
	sectionTitle: {
		fontSize: 18,
		lineHeight: 26,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
	},
	segment: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
	segmentItem: {
		flex: 1,
		minHeight: 44,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	segmentActive: {
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 2,
		elevation: 1,
	},
	segmentText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodyMedium },
	segmentTextActive: { fontFamily: Fonts.bodyBold },
	pressed: { opacity: 0.6 },
	removeBtn: {
		flexDirection: "row",
		gap: 8,
		minHeight: 52,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	removeText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodyBold },
	group: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	activityRow: {
		minHeight: 56,
		paddingHorizontal: 16,
		paddingVertical: 12,
		gap: 2,
		justifyContent: "center",
	},
	activityAction: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
		textTransform: "capitalize",
	},
});
