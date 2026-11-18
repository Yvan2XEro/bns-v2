import { Ionicons } from "@expo/vector-icons";
import { useCounts } from "@novu/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { ShellPattern } from "@/src/components/brand/BackgroundPattern";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { SuspensionBanner } from "@/src/components/moderation/SuspensionBanner";
import { ReviewStars } from "@/src/components/ReviewStars";
import {
	GroupedRow,
	GroupedSection,
	type RowIconTone,
} from "@/src/components/settings/Grouped";
import { UserAvatar } from "@/src/components/settings/UserAvatar";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { switchAppMode } from "@/src/components/shop/SwitchModeButton";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useNotificationReady } from "@/src/contexts/NotificationReadyContext";
import { useHasShopMembership, useStoredAppMode } from "@/src/hooks/useAppMode";
import {
	useIsModerator,
	useModerationSummary,
} from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useCourierMembership } from "@/src/hooks/useRiderShipments";
import { useMyShop, useShopsEnabled } from "@/src/hooks/useShops";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { courierSpaceTarget } from "@/src/lib/riderShipment";
import type { AccountPane } from "./accountPanes";
import { THEME_STORAGE_KEY } from "./SettingsScreen";

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface MenuItemProps {
	icon: IoniconsName;
	label: string;
	sublabel?: string;
	onPress: () => void;
	danger?: boolean;
	iconTone?: RowIconTone;
	rightElement?: React.ReactNode;
	/** Open in the pane beside the menu. */
	selected?: boolean;
	/** What a screen reader says, when it is more than label + sublabel. */
	a11yLabel?: string;
}

function MenuItem({
	icon,
	label,
	sublabel,
	onPress,
	danger,
	iconTone,
	rightElement,
	selected,
	a11yLabel,
}: MenuItemProps) {
	return (
		<GroupedRow
			icon={icon}
			iconTone={iconTone}
			label={label}
			detail={sublabel}
			onPress={onPress}
			destructive={danger}
			selected={selected}
			trailing={rightElement}
			accessory={danger ? "none" : "chevron"}
			accessibilityLabel={
				a11yLabel ?? (sublabel ? `${label}, ${sublabel}` : label)
			}
		/>
	);
}

/**
 * The Notifications row with its unread count, said as well as shown: a
 * screen reader hears "Notifications, 3 non lues", not the bare label.
 * Rendered only inside the Novu provider (`useNotificationReady`).
 */
function NotificationsRowWithCount(props: Omit<MenuItemProps, "a11yLabel">) {
	const { t } = useTranslation();
	const { counts } = useCounts({ filters: [{ read: false }] });
	const count = counts?.[0]?.count ?? 0;
	return (
		<MenuItem
			{...props}
			a11yLabel={
				count > 0
					? `${props.label}, ${t("account.notificationsUnread", {
							count,
							defaultValue:
								count > 1 ? "{{count}} non lues" : "{{count}} non lue",
						})}`
					: props.label
			}
			rightElement={
				count > 0 ? (
					<View
						style={styles.notifBadge}
						importantForAccessibility="no-hide-descendants"
						accessibilityElementsHidden
					>
						<Text style={styles.notifBadgeText}>
							{count > 9 ? "9+" : count}
						</Text>
					</View>
				) : undefined
			}
		/>
	);
}

/**
 * The account tab's menu. Its entries open beside it on a tablet in
 * landscape (`ACCOUNT_PANES`) and as their own screens otherwise; seller
 * mode, moderation and the courier space always take the whole screen.
 */
export function AccountMenu({ selectedId, onOpen }: SplitListProps) {
	const entry = (pane: AccountPane) => ({
		onPress: () => onOpen(pane),
		selected: selectedId === pane,
	});
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { user, logout } = useAuth();
	const isModerator = useIsModerator();
	const { data: moderationSummary } = useModerationSummary();
	const pendingCount = moderationSummary?.total ?? 0;
	// The flag gates opening a NEW shop only; an owner keeps their shop entry
	// regardless of it, which is why `ownShop` — not `shopsEnabled` — decides
	// whether the row below shows a shop or the "open a shop" invite.
	const shopsEnabled = useShopsEnabled();
	const { ordersEnabled } = useAppConfig();
	const courierSpace = courierSpaceTarget(useCourierMembership().data ?? []);
	const { data: myShop } = useMyShop();
	const ownShop = myShop?.shop ?? null;
	// Staff of someone else's shop get seller mode too, not only owners.
	const isShopMember = useHasShopMembership().shopCount > 0;
	// Opened from the seller Boutique tab, the row offers the way back instead.
	const inSellerMode = useStoredAppMode().mode === "seller";
	const { showConfirm } = useAlert();
	const { t, i18n } = useTranslation();
	const pathname = usePathname();

	const notificationReady = useNotificationReady();
	// The guest's one Settings row says what is set there: language · theme.
	const [themeChoice, setThemeChoice] = useState<string | null>(null);
	useEffect(() => {
		if (user) return;
		let alive = true;
		AsyncStorage.getItem(THEME_STORAGE_KEY)
			.then((saved) => {
				if (alive) setThemeChoice(saved ?? "system");
			})
			.catch(() => {
				if (alive) setThemeChoice("system");
			});
		return () => {
			alive = false;
		};
	}, [user]);

	const c = Colors[isDark ? "dark" : "light"];
	const bg = c.background;
	const textColor = c.foreground;
	const mutedColor = c.mutedForeground;
	// Headers sit on the ground like every other screen; the shell's indigo
	// is kept for the guest card, as DESIGN.md asks.
	const accentBg = bg;

	if (!user) {
		const goLogin = () =>
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
		const goRegister = () =>
			router.push({
				pathname: "/auth/register",
				params: getAuthModalParams(pathname),
			});
		const language =
			i18n.language?.slice(0, 2) === "en" ? "English" : "Français";
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<View style={[styles.noUserHeader, { backgroundColor: accentBg }]}>
					<View
						style={[styles.accountIconWrap, { backgroundColor: c.primaryTint }]}
					>
						<Ionicons name="person" size={22} color={c.link} />
					</View>
					<Text
						accessibilityRole="header"
						style={[styles.headerTitle, { color: textColor }]}
					>
						{t("account.myAccount")}
					</Text>
				</View>
				<ScrollView
					style={[styles.contentWrap, { backgroundColor: bg }]}
					contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
					showsVerticalScrollIndicator={false}
				>
					{/* The invitation: what an account unlocks, then the two ways in. */}
					<View style={styles.section}>
						<View
							style={[
								styles.guestCard,
								{
									// The shell indigo; at night it lifts a step so the
									// card still reads against the night ground.
									backgroundColor: isDark ? "#16265c" : c.shell,
								},
							]}
						>
							<ShellPattern />
							<Text accessibilityRole="header" style={styles.guestTitle}>
								{t("account.guestTitle")}
							</Text>
							<Text style={styles.guestPrompt}>
								{t("account.signInPrompt")}
							</Text>
							{(
								[
									["heart-outline", t("account.guestPerkFavorites")],
									["chatbubbles-outline", t("account.guestPerkMessages")],
									["cube-outline", t("account.guestPerkOrders")],
								] as const
							).map(([icon, label]) => (
								<View key={icon} style={styles.guestPerk}>
									<Ionicons name={icon} size={18} color={c.shellMuted} />
									<Text style={styles.guestPerkText}>{label}</Text>
								</View>
							))}
							<View style={styles.guestActions}>
								<Pressable
									onPress={goLogin}
									accessibilityRole="button"
									style={styles.guestPrimary}
								>
									<Text style={styles.guestPrimaryText}>
										{t("account.signIn")}
									</Text>
								</Pressable>
								<Pressable
									onPress={goRegister}
									accessibilityRole="button"
									style={styles.guestSecondary}
								>
									<Text style={styles.guestSecondaryText}>
										{t("account.createAccount")}
									</Text>
								</Pressable>
							</View>
						</View>
					</View>

					{/* Everything below works without an account. */}
					<GroupedSection
						style={styles.section}
						inset={58}
						title={t("account.sectionPreferences")}
					>
						{/* One row for one place: language and theme are both set in
							    Settings, so the row names their current values. */}
						<MenuItem
							icon="settings-outline"
							label={t("account.settings")}
							sublabel={[
								language,
								themeChoice === "dark"
									? t("settings.themeDark")
									: themeChoice === "light"
										? t("settings.themeLight")
										: themeChoice
											? t("settings.themeSystem")
											: null,
							]
								.filter(Boolean)
								.join(" · ")}
							{...entry("settings")}
						/>
					</GroupedSection>

					<GroupedSection
						style={styles.section}
						inset={58}
						title={t("account.sectionSupport")}
					>
						<MenuItem
							icon="help-circle-outline"
							label={t("account.help")}
							{...entry("help")}
						/>
						<MenuItem
							icon="shield-checkmark-outline"
							label={t("account.safety")}
							{...entry("safety")}
						/>
						<MenuItem
							icon="mail-outline"
							label={t("account.contact")}
							{...entry("contact")}
						/>
						<MenuItem
							icon="document-text-outline"
							label={t("account.terms")}
							{...entry("terms")}
						/>
						<MenuItem
							icon="lock-closed-outline"
							label={t("account.privacy")}
							{...entry("privacy")}
						/>
					</GroupedSection>
				</ScrollView>
			</SafeAreaView>
		);
	}

	const handleLogout = () => {
		showConfirm(t("account.logoutTitle"), t("account.logoutMessage"), logout);
	};

	// null when createdAt is missing/malformed — the row is skipped rather than
	// showing "Membre depuis Invalid Date" at the top of the Account tab.
	const memberSince = formatDate(user.createdAt, {
		month: "long",
		year: "numeric",
	});

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentContainerStyle={centeredContent}
			>
				{/* ── Header (accent bg) ── */}
				<View style={[styles.profileHeader, { backgroundColor: accentBg }]}>
					<View style={styles.profileTopRow}>
						{/* Avatar */}
						<View style={styles.avatarWrap}>
							<UserAvatar user={user} size={72} />
						</View>

						{/* Info */}
						<View style={{ flex: 1 }}>
							<Text
								accessibilityRole="header"
								style={[styles.userName, { color: textColor }]}
								numberOfLines={1}
							>
								{user.name}
							</Text>
							{(user.totalReviews ?? 0) > 0 && (
								<ReviewStars
									rating={user.rating ?? 0}
									showCount
									count={user.totalReviews}
								/>
							)}
							{memberSince && (
								<Text style={[styles.memberSince, { color: mutedColor }]}>
									{t("account.memberSince")} {memberSince}
								</Text>
							)}
							{/* Trust status where the person looks first: a seller who
							    cannot publish learns why here, not at a gate. Old API
							    versions send no `phoneVerified`, and nothing is said. */}
							{user.phoneVerified === true ? (
								<View style={styles.trustRow}>
									<Ionicons
										name="checkmark-circle"
										size={15}
										color={c.successText}
									/>
									<Text style={[styles.trustText, { color: c.successText }]}>
										{t("shop.levelPhone")}
									</Text>
								</View>
							) : user.phoneVerified === false ? (
								<Pressable
									onPress={() => router.push("/verify-phone")}
									accessibilityRole="button"
									accessibilityLabel={`${t("account.phoneNotVerified", {
										defaultValue: "Téléphone non vérifié",
									})}, ${t("account.verifyNow")}`}
									hitSlop={10}
									style={styles.trustRow}
								>
									<Ionicons
										name="alert-circle"
										size={15}
										color={c.warningText}
									/>
									<Text style={[styles.trustText, { color: c.warningText }]}>
										{t("account.phoneNotVerified", {
											defaultValue: "Téléphone non vérifié",
										})}
										{" · "}
										<Text style={[styles.trustLink, { color: c.link }]}>
											{t("account.verifyNow")}
										</Text>
									</Text>
								</Pressable>
							) : null}
						</View>

						<AnimatedPressable
							{...entry("editProfile")}
							scaleTo={0.95}
							hitSlop={6}
							accessibilityLabel={t("account.editProfile")}
							style={[
								styles.editBtn,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<Ionicons name="pencil" size={14} color={c.link} />
							<Text style={[styles.editBtnText, { color: c.link }]}>
								{t("account.edit")}
							</Text>
						</AnimatedPressable>
					</View>
				</View>

				{/* ── Content (main bg, rounded top) ── */}
				<View style={[styles.content, { backgroundColor: bg }]}>
					<SuspensionBanner />

					{isModerator && (
						<GroupedSection
							style={styles.section}
							inset={58}
							title={t("account.sectionModeration")}
						>
							<MenuItem
								icon="shield-half-outline"
								label={t("account.moderation")}
								sublabel={
									pendingCount > 0
										? t("account.moderationPending", { count: pendingCount })
										: t("account.moderationIdle")
								}
								iconTone="sun"
								rightElement={
									pendingCount > 0 ? (
										<View style={styles.notifBadge}>
											<Text style={styles.notifBadgeText}>
												{pendingCount > 9 ? "9+" : pendingCount}
											</Text>
										</View>
									) : undefined
								}
								onPress={() => router.push("/moderation")}
							/>
						</GroupedSection>
					)}

					{(shopsEnabled || ownShop || isShopMember) && (
						<GroupedSection
							style={styles.section}
							inset={58}
							title={t("account.sectionShop")}
						>
							{ownShop ? (
								<MenuItem
									icon="storefront-outline"
									label={ownShop.name}
									sublabel={
										ownShop.status === "suspended"
											? t("account.shopSuspended")
											: t("account.myShop")
									}
									iconTone="brand"
									rightElement={<LevelBadge badge={ownShop.badge} size="sm" />}
									onPress={() => router.push("/seller")}
								/>
							) : shopsEnabled ? (
								<MenuItem
									icon="storefront-outline"
									label={t("account.openShop")}
									sublabel={t("account.openShopSublabel")}
									iconTone="sun"
									onPress={() => router.push("/shop/create")}
								/>
							) : null}
							{isShopMember ? (
								<MenuItem
									icon="swap-horizontal"
									label={
										inSellerMode
											? t("sellerMode.switchToBuyer")
											: t("sellerMode.switchToSeller")
									}
									sublabel={
										inSellerMode
											? t("sellerMode.switchToBuyerSub")
											: t("sellerMode.switchToSellerSub")
									}
									iconTone="brand"
									onPress={() =>
										switchAppMode(inSellerMode ? "buyer" : "seller")
									}
								/>
							) : null}
						</GroupedSection>
					)}

					{/* Mon activité */}
					<GroupedSection
						style={styles.section}
						inset={58}
						title={t("account.sectionPurchases")}
					>
						{ordersEnabled ? (
							<>
								<MenuItem
									icon="bag-handle-outline"
									label={t("account.myPurchases")}
									sublabel={t("account.myPurchasesSublabel")}
									{...entry("purchases")}
								/>
								<MenuItem
									icon="chatbubble-ellipses-outline"
									label={t("disputes.title")}
									sublabel={t("disputes.subtitle")}
									{...entry("disputes")}
								/>
								<MenuItem
									icon="return-down-back-outline"
									label={t("returns.title")}
									sublabel={t("returns.subtitle")}
									{...entry("returns")}
								/>
								<MenuItem
									icon="location-outline"
									label={t("addresses.title")}
									sublabel={t("addresses.menuSublabel")}
									{...entry("addresses")}
								/>
								<MenuItem
									icon="cart-outline"
									label={t("account.cart")}
									{...entry("cart")}
								/>
							</>
						) : null}
						{courierSpace ? (
							<MenuItem
								icon="bicycle-outline"
								label={t("shipmentPanel.courierSpace")}
								sublabel={t("shipmentPanel.courierSpaceSublabel")}
								onPress={() => router.push(courierSpace)}
							/>
						) : null}
						{notificationReady ? (
							<NotificationsRowWithCount
								icon="notifications-outline"
								label={t("account.notifications")}
								{...entry("notifications")}
							/>
						) : (
							<MenuItem
								icon="notifications-outline"
								label={t("account.notifications")}
								{...entry("notifications")}
							/>
						)}
						<MenuItem
							icon="heart-outline"
							label={t("account.favorites")}
							sublabel={t("account.favoritesSublabel")}
							{...entry("favorites")}
						/>
						<MenuItem
							icon="bookmark-outline"
							label={t("account.savedSearches")}
							{...entry("searches")}
						/>
					</GroupedSection>

					{/* Mes annonces */}
					<GroupedSection
						style={styles.section}
						inset={58}
						title={t("account.sectionListings")}
					>
						<MenuItem
							icon="cube-outline"
							label={t("account.myListings")}
							sublabel={t("account.myListingsSublabel")}
							{...entry("listings")}
						/>
						<MenuItem
							icon="rocket-outline"
							label={t("account.boostHistory")}
							{...entry("boosts")}
						/>
					</GroupedSection>

					{/* Paramètres */}
					<GroupedSection
						style={styles.section}
						inset={58}
						title={t("account.sectionSettings")}
					>
						<MenuItem
							icon="settings-outline"
							label={t("account.settings")}
							{...entry("settings")}
						/>
						<MenuItem
							icon="shield-checkmark-outline"
							label={t("account.security")}
							{...entry("security")}
						/>
					</GroupedSection>

					{/* Assistance */}
					<GroupedSection
						style={styles.section}
						inset={58}
						title={t("account.sectionSupport")}
					>
						<MenuItem
							icon="help-circle-outline"
							label={t("account.help")}
							{...entry("help")}
						/>
						<MenuItem
							icon="shield-checkmark-outline"
							label={t("account.safety")}
							{...entry("safety")}
						/>
						<MenuItem
							icon="mail-outline"
							label={t("account.contact")}
							{...entry("contact")}
						/>
						<MenuItem
							icon="document-text-outline"
							label={t("account.terms")}
							{...entry("terms")}
						/>
						<MenuItem
							icon="lock-closed-outline"
							label={t("account.privacy")}
							{...entry("privacy")}
						/>
					</GroupedSection>

					{/* Déconnexion */}
					<GroupedSection style={[styles.section, { marginBottom: 32 }]}>
						<MenuItem
							icon="log-out-outline"
							label={t("account.logout")}
							onPress={handleLogout}
							danger
						/>
					</GroupedSection>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	guestCard: { borderRadius: 22, padding: 20, gap: 10, overflow: "hidden" },
	guestTitle: {
		color: "#ffffff",
		fontFamily: Fonts.displayExtrabold,
		fontSize: 24,
		lineHeight: 32,
		letterSpacing: -0.5,
	},
	guestPrompt: {
		color: "#e3e9fb",
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 22,
		marginBottom: 4,
	},
	guestPerk: { flexDirection: "row", alignItems: "center", gap: 10 },
	guestPerkText: {
		flex: 1,
		color: "#eff1fb",
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 21,
	},
	guestActions: { flexDirection: "row", gap: 10, marginTop: 10 },
	// The shell's own button: white with ink. Signage yellow is kept for
	// prices, selling and boosts (DESIGN.md).
	guestPrimary: {
		flex: 1,
		backgroundColor: "#ffffff",
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	guestPrimaryText: {
		color: "#12163a",
		fontFamily: Fonts.bodyBold,
		fontSize: 16,
		lineHeight: 22,
	},
	guestSecondary: {
		flex: 1,
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.35)",
	},
	guestSecondaryText: {
		color: "#ffffff",
		fontFamily: Fonts.bodyBold,
		fontSize: 16,
		lineHeight: 22,
	},
	safe: { flex: 1 },

	/* ── No-user header ── */
	noUserHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 6,
		paddingBottom: 14,
	},
	accountIconWrap: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	contentWrap: {
		flex: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},
	// Tab roots share the h1 large title (30/34), like Search and Messages.
	headerTitle: {
		fontSize: 30,
		lineHeight: 38,
		letterSpacing: -0.8,
		fontFamily: Fonts.displayExtrabold,
	},

	/* ── Profile header ── */
	profileHeader: {
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 24,
	},
	profileTopRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 12,
	},
	avatarWrap: { position: "relative" },
	trustRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		marginTop: 6,
		minHeight: 24,
	},
	trustText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	trustLink: { fontFamily: Fonts.bodyBold },
	userName: {
		fontSize: 24,
		lineHeight: 32,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
		marginBottom: 3,
	},
	memberSince: {
		fontSize: 13,
		lineHeight: 18,
		marginTop: 4,
		fontFamily: Fonts.body,
	},
	editBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth * 2,
		paddingHorizontal: 14,
		minHeight: 40,
	},
	editBtnText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },

	/* ── Content ── */
	content: {
		borderTopLeftRadius: 22,
		borderTopRightRadius: 22,
		paddingTop: 24,
		minHeight: 500,
	},
	section: { paddingHorizontal: 16, marginBottom: 24 },

	/* ── Menu item ── */

	/* ── Register row ── */
	notifBadge: {
		backgroundColor: "#d23a2e",
		borderRadius: 10,
		minWidth: 18,
		height: 18,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 5,
		marginRight: 4,
	},
	notifBadgeText: {
		color: "#fff",
		fontSize: 11,
		lineHeight: 14,
		fontFamily: Fonts.displayExtrabold,
	},
});
