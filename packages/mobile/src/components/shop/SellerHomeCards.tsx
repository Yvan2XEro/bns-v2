import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
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
			<Text style={[styles.title, { color: c.text }]}>
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
					<Ionicons name="share-outline" size={15} color={c.primary} />
					<Text style={[styles.moreText, { color: c.primary }]}>
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
			<View style={styles.tipHead}>
				<Ionicons name="bulb-outline" size={18} color={c.primary} />
				<Text style={[styles.tipLabel, { color: c.primary }]}>
					{t("sellerHome.tipLabel")}
				</Text>
			</View>
			<Text style={[styles.rowTitle, { color: c.text }]}>
				{t(`sellerHome.tip.${tip}.title`)}
			</Text>
			<Text style={[styles.body, { color: c.body }]}>
				{t(`sellerHome.tip.${tip}.body`)}
			</Text>
			<View style={styles.tipActions}>
				{onOpen ? (
					<Pressable
						onPress={onOpen}
						accessibilityRole="button"
						style={[styles.tipButton, { backgroundColor: c.primary }]}
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
	title: { fontSize: 18, fontFamily: Fonts.displayBold },
	body: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
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
		minHeight: 44,
		alignSelf: "flex-start",
	},
	moreText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	tip: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 6,
	},
	tipHead: { flexDirection: "row", alignItems: "center", gap: 6 },
	tipLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodyBold,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	tipActions: { flexDirection: "row", gap: 8, marginTop: 4 },
	tipButton: {
		minHeight: 44,
		borderRadius: 12,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	tipButtonText: {
		color: "#fff",
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},
	tipGhost: {
		minHeight: 44,
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
