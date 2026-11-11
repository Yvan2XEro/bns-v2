import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { fillOf } from "@/src/components/shop/ink";
import { useTranslation } from "@/src/lib/i18n";
import type {
	LaunchActionKey,
	SellerTipKey,
} from "../../../../api/src/contracts/sellerOnboarding";
import { useShopTheme } from "./theme";

type IoniconsName = keyof typeof Ionicons.glyphMap;

const LAUNCH_ICONS: Record<LaunchActionKey, IoniconsName> = {
	shareWhatsapp: "logo-whatsapp",
	boost: "rocket-outline",
	addProducts: "add-circle-outline",
	addListing: "add-circle-outline",
	verify: "shield-checkmark-outline",
	addWhatsapp: "call-outline",
	replyFast: "chatbubbles-outline",
};

/**
 * "No sales yet": the screen's teaching empty state. Each row is one thing
 * that brings a first buyer, and one tap to do it.
 */
export function SellerLaunchCard({
	actions,
	onAction,
	onMoreShare,
}: {
	actions: LaunchActionKey[];
	onAction: (action: LaunchActionKey) => void;
	onMoreShare: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text
				accessibilityRole="header"
				style={[styles.title, { color: c.text }]}
			>
				{t("sellerHome.launchTitle")}
			</Text>
			<Text style={[styles.body, { color: c.body }]}>
				{t("sellerHome.launchBody")}
			</Text>
			{actions.map((action, index) => {
				const lead = index === 0;
				return (
					<Pressable
						key={action}
						onPress={() => onAction(action)}
						accessibilityRole="button"
						style={({ pressed }) => [
							styles.row,
							{ borderTopColor: c.border },
							pressed && { opacity: 0.85 },
						]}
					>
						<View
							style={[
								styles.icon,
								{ backgroundColor: lead ? c.successSoft : c.primarySoft },
							]}
						>
							<Ionicons
								name={LAUNCH_ICONS[action]}
								size={19}
								color={lead ? c.successText : c.primary}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[styles.rowTitle, { color: c.text }]}>
								{t(`sellerHome.launch.${action}.title`)}
							</Text>
							<Text style={[styles.meta, { color: c.muted }]}>
								{t(`sellerHome.launch.${action}.body`)}
							</Text>
						</View>
						<Ionicons name="chevron-forward" size={16} color={c.muted} />
					</Pressable>
				);
			})}
			{actions.includes("shareWhatsapp") ? (
				<Pressable
					onPress={onMoreShare}
					accessibilityRole="button"
					style={styles.more}
				>
					<Ionicons name="share-outline" size={15} color={c.link} />
					<Text style={[styles.moreText, { color: c.link }]}>
						{t("sellerHome.moreShare")}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}

/** « Le saviez-vous ? »: one contextual tip, a link to the feature, and a way to say "got it". */
export function SellerTipCard({
	tip,
	onOpen,
	onDismiss,
}: {
	tip: SellerTipKey;
	onOpen: (() => void) | null;
	onDismiss: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View
			style={[
				styles.tip,
				{ backgroundColor: c.primarySoft, borderColor: c.border },
			]}
			accessibilityRole="summary"
		>
			{/* The tip names itself: a bulb and its title, no label above it. */}
			<View
				style={styles.tipHead}
				accessible
				accessibilityRole="header"
				accessibilityLabel={`${t("sellerHome.tipLabel")} ${t(`sellerHome.tip.${tip}.title`)}`}
			>
				<Ionicons name="bulb-outline" size={20} color={c.link} />
				<Text style={[styles.tipTitle, { color: c.text }]}>
					{t(`sellerHome.tip.${tip}.title`)}
				</Text>
			</View>
			<Text style={[styles.body, { color: c.body }]}>
				{t(`sellerHome.tip.${tip}.body`)}
			</Text>
			<View style={styles.tipActions}>
				{onOpen ? (
					<Pressable
						onPress={onOpen}
						accessibilityRole="button"
						style={[styles.tipButton, { backgroundColor: fillOf(c) }]}
					>
						<Text style={styles.tipButtonText}>
							{t(`sellerHome.tip.${tip}.action`)}
						</Text>
					</Pressable>
				) : null}
				<Pressable
					onPress={onDismiss}
					accessibilityRole="button"
					style={styles.tipGhost}
				>
					<Text style={[styles.moreText, { color: c.body }]}>
						{t("sellerHome.tipDismiss")}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

/** The pull-help entry: the seller guide, never pushed. */
export function SellerGuideLink({ onPress }: { onPress: () => void }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="link"
			style={({ pressed }) => [
				styles.guide,
				{ backgroundColor: c.card, borderColor: c.border },
				pressed && { opacity: 0.85 },
			]}
		>
			<View style={[styles.icon, { backgroundColor: c.neutralSoft }]}>
				<Ionicons name="book-outline" size={19} color={c.neutralText} />
			</View>
			<View style={{ flex: 1 }}>
				<Text style={[styles.rowTitle, { color: c.text }]}>
					{t("sellerGuide.title")}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("sellerGuide.entryBody")}
				</Text>
			</View>
			<Ionicons name="chevron-forward" size={16} color={c.muted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 8,
	},
	title: { fontSize: 19, lineHeight: 24, fontFamily: Fonts.displayBold },
	body: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	meta: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 60,
		paddingVertical: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	icon: {
		width: 38,
		height: 38,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	rowTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	more: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 48,
		alignSelf: "flex-start",
	},
	moreText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	tip: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 6,
	},
	tipHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
	tipTitle: {
		flex: 1,
		fontSize: 16,
		lineHeight: 21,
		fontFamily: Fonts.displayBold,
	},
	tipActions: { flexDirection: "row", gap: 8, marginTop: 4 },
	tipButton: {
		minHeight: 48,
		borderRadius: 12,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	tipButtonText: {
		color: "#fff",
		fontSize: 16,
		fontFamily: Fonts.bodyBold,
	},
	tipGhost: {
		minHeight: 48,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	guide: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 14,
		minHeight: 64,
	},
});
