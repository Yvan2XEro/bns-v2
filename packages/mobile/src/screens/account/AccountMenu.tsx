import { Ionicons } from "@expo/vector-icons";
import { useCounts } from "@novu/react-native";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { SuspensionBanner } from "@/src/components/moderation/SuspensionBanner";
import { ReviewStars } from "@/src/components/ReviewStars";
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
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { courierSpaceTarget } from "@/src/lib/riderShipment";
import type { AccountPane } from "./accountPanes";

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface MenuItemProps {
	icon: IoniconsName;
	label: string;
	sublabel?: string;
	onPress: () => void;
	danger?: boolean;
	iconBg?: string;
	iconColor?: string;
	isDark: boolean;
	borderColor: string;
	rightElement?: React.ReactNode;
	/** Open in the pane beside the menu. */
	selected?: boolean;
}

function MenuItem({
	icon,
	label,
	sublabel,
	onPress,
	danger,
	iconBg,
	iconColor,
	isDark,
	borderColor,
	rightElement,
	selected,
}: MenuItemProps) {
	const selectedStyle = useSelectedRowStyle()(selected);
	const textColor = danger ? "#dc2626" : isDark ? "#e2e8f0" : "#0f172a";
	const resolvedIconColor = danger
		? "#dc2626"
		: (iconColor ?? (isDark ? "#94a3b8" : "#475569"));
	const resolvedIconBg = danger
		? isDark
			? "#3b1111"
			: "#fee2e2"
		: (iconBg ?? (isDark ? "#1e293b" : "#f1f5f9"));

	return (
		<AnimatedPressable
			onPress={onPress}
			scaleTo={0.98}
			accessibilityState={{ selected: Boolean(selected) }}
			style={[
				styles.menuItem,
				{ borderBottomColor: borderColor },
				selectedStyle,
			]}
		>
			<View style={[styles.iconBox, { backgroundColor: resolvedIconBg }]}>
				<Ionicons name={icon} size={17} color={resolvedIconColor} />
			</View>
			<View style={{ flex: 1 }}>
				<Text style={[styles.menuLabel, { color: textColor }]}>{label}</Text>
				{sublabel && (
					<Text
						style={[
							styles.menuSublabel,
							{ color: isDark ? "#64748b" : "#94a3b8" },
						]}
					>
						{sublabel}
					</Text>
				)}
			</View>
			{rightElement}
			<Ionicons
				name="chevron-forward"
				size={16}
				color={isDark ? "#334155" : "#cbd5e1"}
			/>
		</AnimatedPressable>
	);
}

function NotificationsUnreadBadge() {
	const { counts } = useCounts({ filters: [{ read: false }] });
	const count = counts?.[0]?.count ?? 0;
	if (count === 0) return null;
	return (
		<View style={styles.notifBadge}>
			<Text style={styles.notifBadgeText}>{count > 9 ? "9+" : count}</Text>
		</View>
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

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e293b" : "#f1f5f9";
	const accentBg = isDark ? "#111827" : "#eef2ff";

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
		const cardStyle = [
			styles.sectionCard,
			{ backgroundColor: cardBg, borderColor: isDark ? "#1e3a5f" : "#e2e8f0" },
		];
		const language =
			i18n.language?.slice(0, 2) === "en" ? "English" : "Français";
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<View style={[styles.noUserHeader, { backgroundColor: accentBg }]}>
					<View
						style={[
							styles.accountIconWrap,
							{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
						]}
					>
						<Ionicons name="person" size={22} color={primaryColor} />
					</View>
					<Text style={[styles.headerTitle, { color: textColor }]}>
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
									backgroundColor: isDark ? "#13213f" : "#1e40af",
								},
							]}
						>
							<Text style={styles.guestTitle}>{t("account.guestTitle")}</Text>
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
									<Ionicons name={icon} size={16} color="#bfdbfe" />
									<Text style={styles.guestPerkText}>{label}</Text>
								</View>
							))}
							<View style={styles.guestActions}>
								<Pressable
									onPress={goLogin}
									accessibilityRole="button"
									style={[styles.guestPrimary, { backgroundColor: "#f59e0b" }]}
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
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionPreferences")}
						</Text>
						<View style={cardStyle}>
							<MenuItem
								icon="language-outline"
								label={t("settings.language")}
								sublabel={language}
								{...entry("settings")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="contrast-outline"
								label={t("settings.theme")}
								{...entry("settings")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="settings-outline"
								label={t("account.settings")}
								{...entry("settings")}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>

					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionSupport")}
						</Text>
						<View style={cardStyle}>
							<MenuItem
								icon="help-circle-outline"
								label={t("account.help")}
								{...entry("help")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="shield-checkmark-outline"
								label={t("account.safety")}
								{...entry("safety")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="mail-outline"
								label={t("account.contact")}
								{...entry("contact")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="document-text-outline"
								label={t("account.terms")}
								{...entry("terms")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="lock-closed-outline"
								label={t("account.privacy")}
								{...entry("privacy")}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>
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
							{user.avatar?.url ? (
								<Image
									source={{
										uri:
											resolveListingImageUrl(user.avatar, "thumbnail") ??
											user.avatar?.url,
									}}
									style={styles.avatar}
									contentFit="cover"
								/>
							) : (
								<View
									style={[
										styles.avatarPlaceholder,
										{ backgroundColor: primaryColor },
									]}
								>
									<Text style={styles.avatarLetter}>
										{user.name?.[0]?.toUpperCase() ?? "?"}
									</Text>
								</View>
							)}
						</View>

						{/* Info */}
						<View style={{ flex: 1 }}>
							<Text
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
						</View>

						<AnimatedPressable
							{...entry("editProfile")}
							scaleTo={0.95}
							style={[styles.editBtn, { backgroundColor: cardBg }]}
						>
							<Ionicons name="pencil" size={14} color={primaryColor} />
							<Text style={[styles.editBtnText, { color: primaryColor }]}>
								{t("account.edit")}
							</Text>
						</AnimatedPressable>
					</View>
				</View>

				{/* ── Content (main bg, rounded top) ── */}
				<View style={[styles.content, { backgroundColor: bg }]}>
					<SuspensionBanner />

					{isModerator && (
						<View style={styles.section}>
							<Text style={[styles.sectionLabel, { color: mutedColor }]}>
								{t("account.sectionModeration")}
							</Text>
							<View
								style={[
									styles.sectionCard,
									{
										backgroundColor: cardBg,
										borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
									},
								]}
							>
								<MenuItem
									icon="shield-half-outline"
									label={t("account.moderation")}
									sublabel={
										pendingCount > 0
											? t("account.moderationPending", { count: pendingCount })
											: t("account.moderationIdle")
									}
									iconBg={isDark ? "#451a03" : "#fef3c7"}
									iconColor="#d97706"
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
									isDark={isDark}
									borderColor={borderColor}
								/>
							</View>
						</View>
					)}

					{(shopsEnabled || ownShop || isShopMember) && (
						<View style={styles.section}>
							<Text style={[styles.sectionLabel, { color: mutedColor }]}>
								{t("account.sectionShop")}
							</Text>
							<View
								style={[
									styles.sectionCard,
									{
										backgroundColor: cardBg,
										borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
									},
								]}
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
										iconBg={isDark ? "#172554" : "#dbeafe"}
										iconColor={primaryColor}
										rightElement={
											<LevelBadge badge={ownShop.badge} size="sm" />
										}
										onPress={() => router.push("/seller")}
										isDark={isDark}
										borderColor={borderColor}
									/>
								) : shopsEnabled ? (
									<MenuItem
										icon="storefront-outline"
										label={t("account.openShop")}
										sublabel={t("account.openShopSublabel")}
										iconBg={isDark ? "#451a03" : "#fef3c7"}
										iconColor="#d97706"
										onPress={() => router.push("/shop/create")}
										isDark={isDark}
										borderColor={borderColor}
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
										iconBg={isDark ? "#172554" : "#dbeafe"}
										iconColor={primaryColor}
										onPress={() =>
											switchAppMode(inSellerMode ? "buyer" : "seller")
										}
										isDark={isDark}
										borderColor={borderColor}
									/>
								) : null}
							</View>
						</View>
					)}

					{/* Mon activité */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionPurchases")}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
								},
							]}
						>
							{ordersEnabled ? (
								<>
									<MenuItem
										icon="bag-handle-outline"
										label={t("account.myPurchases")}
										sublabel={t("account.myPurchasesSublabel")}
										{...entry("purchases")}
										isDark={isDark}
										borderColor={borderColor}
									/>
									<MenuItem
										icon="chatbubble-ellipses-outline"
										label={t("disputes.title")}
										sublabel={t("disputes.subtitle")}
										{...entry("disputes")}
										isDark={isDark}
										borderColor={borderColor}
									/>
									<MenuItem
										icon="return-down-back-outline"
										label={t("returns.title")}
										sublabel={t("returns.subtitle")}
										{...entry("returns")}
										isDark={isDark}
										borderColor={borderColor}
									/>
									<MenuItem
										icon="location-outline"
										label={t("addresses.title")}
										sublabel={t("addresses.menuSublabel")}
										{...entry("addresses")}
										isDark={isDark}
										borderColor={borderColor}
									/>
									<MenuItem
										icon="cart-outline"
										label={t("account.cart")}
										{...entry("cart")}
										isDark={isDark}
										borderColor={borderColor}
									/>
								</>
							) : null}
							{courierSpace ? (
								<MenuItem
									icon="bicycle-outline"
									label={t("shipmentPanel.courierSpace")}
									sublabel={t("shipmentPanel.courierSpaceSublabel")}
									onPress={() => router.push(courierSpace)}
									isDark={isDark}
									borderColor={borderColor}
								/>
							) : null}
							<MenuItem
								icon="heart-outline"
								label={t("account.favorites")}
								sublabel={t("account.favoritesSublabel")}
								{...entry("favorites")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="bookmark-outline"
								label={t("account.savedSearches")}
								{...entry("searches")}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>

					{/* Mes annonces */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionListings")}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
								},
							]}
						>
							<MenuItem
								icon="cube-outline"
								label={t("account.myListings")}
								sublabel={t("account.myListingsSublabel")}
								{...entry("listings")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="rocket-outline"
								label={t("account.boostHistory")}
								{...entry("boosts")}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>

					{/* Paramètres */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionSettings")}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
								},
							]}
						>
							<MenuItem
								icon="settings-outline"
								label={t("account.settings")}
								{...entry("settings")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="shield-checkmark-outline"
								label={t("account.security")}
								{...entry("security")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="notifications-outline"
								label={t("account.notifications")}
								{...entry("notifications")}
								isDark={isDark}
								borderColor="transparent"
								rightElement={
									notificationReady ? <NotificationsUnreadBadge /> : undefined
								}
							/>
						</View>
					</View>

					{/* Assistance */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionSupport")}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
								},
							]}
						>
							<MenuItem
								icon="help-circle-outline"
								label={t("account.help")}
								{...entry("help")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="shield-checkmark-outline"
								label={t("account.safety")}
								{...entry("safety")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="mail-outline"
								label={t("account.contact")}
								{...entry("contact")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="document-text-outline"
								label={t("account.terms")}
								{...entry("terms")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="lock-closed-outline"
								label={t("account.privacy")}
								{...entry("privacy")}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>

					{/* Déconnexion */}
					<View style={[styles.section, { marginBottom: 32 }]}>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
								},
							]}
						>
							<MenuItem
								icon="log-out-outline"
								label={t("account.logout")}
								onPress={handleLogout}
								danger
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	guestCard: { borderRadius: 22, padding: 20, gap: 10 },
	guestTitle: { color: "#ffffff", fontFamily: Fonts.displayBold, fontSize: 22 },
	guestPrompt: {
		color: "#dbeafe",
		fontFamily: Fonts.body,
		fontSize: 14,
		lineHeight: 20,
		marginBottom: 4,
	},
	guestPerk: { flexDirection: "row", alignItems: "center", gap: 10 },
	guestPerkText: { color: "#eff6ff", fontFamily: Fonts.body, fontSize: 14 },
	guestActions: { flexDirection: "row", gap: 10, marginTop: 10 },
	guestPrimary: {
		flex: 1,
		height: 46,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	guestPrimaryText: {
		color: "#0f172a",
		fontFamily: Fonts.bodySemibold,
		fontSize: 15,
	},
	guestSecondary: {
		flex: 1,
		height: 46,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.35)",
	},
	guestSecondaryText: {
		color: "#ffffff",
		fontFamily: Fonts.bodySemibold,
		fontSize: 15,
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
	headerTitle: { fontSize: 24, fontFamily: Fonts.displayExtrabold },

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
	avatar: { width: 72, height: 72, borderRadius: 22 },
	avatarPlaceholder: {
		width: 72,
		height: 72,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarLetter: {
		fontSize: 28,
		fontFamily: Fonts.displayBold,
		color: "#fff",
	},
	verifiedBadge: {
		position: "absolute",
		bottom: -2,
		right: -2,
		backgroundColor: "#fff",
		borderRadius: 10,
	},
	userName: { fontSize: 18, fontFamily: Fonts.displayBold, marginBottom: 3 },
	memberSince: { fontSize: 12, marginTop: 3, fontFamily: Fonts.body },
	editBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 10,
		paddingHorizontal: 10,
		paddingVertical: 7,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 4,
		elevation: 2,
	},
	editBtnText: { fontSize: 12, fontFamily: Fonts.bodySemibold },

	/* ── Content ── */
	content: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingTop: 20,
		minHeight: 500,
	},
	section: { paddingHorizontal: 16, marginBottom: 12 },
	sectionLabel: {
		fontSize: 11,
		textTransform: "uppercase",
		fontFamily: Fonts.bodySemibold,
		letterSpacing: 1,
		marginBottom: 8,
		marginLeft: 4,
	},
	sectionCard: {
		borderRadius: 14,
		overflow: "hidden",
		borderWidth: 1,
	},

	/* ── Menu item ── */
	menuItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingVertical: 13,
		borderBottomWidth: 1,
		gap: 12,
	},
	iconBox: {
		width: 34,
		height: 34,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	menuLabel: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	menuSublabel: { fontSize: 11, fontFamily: Fonts.body, marginTop: 1 },

	/* ── Register row ── */
	registerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
	},
	registerText: { fontSize: 14, fontFamily: Fonts.body },
	registerLink: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	notifBadge: {
		backgroundColor: "#dc2626",
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
		fontSize: 10,
		fontFamily: Fonts.displayExtrabold,
	},
});
