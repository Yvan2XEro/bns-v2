import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import { MODERATION_HOLD_REASON_LABELS } from "@/src/lib/moderationPayments";
import type { ShopPaymentsHold } from "@/src/types/api";
import { DecisionButton, SectionTitle } from "./ModerationKit";
import type { ModerationPalette, Translate } from "./theme";
import { tonesOf } from "./tones";

interface ShopPaymentsHoldsCardProps {
	holds: ShopPaymentsHold[];
	actionable: boolean;
	releasePending: boolean;
	onPlaceHold: () => void;
	onReleaseHold: (holdId: string) => void;
	c: ModerationPalette;
	t: Translate;
}

/** Every active hold, the system's own as much as a moderator's — staff see
 * the real reason, unlike the shop's own setup view, which gets the
 * category alone. */
export function ShopPaymentsHoldsCard({
	holds,
	actionable,
	releasePending,
	onPlaceHold,
	onReleaseHold,
	c,
	t,
}: ShopPaymentsHoldsCardProps) {
	const k = tonesOf(c);
	return (
		<View style={styles.section}>
			<SectionTitle
				right={
					actionable ? (
						// Opens the hold sheet: a red outline, like every sanction.
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("moderation.paymentsPlaceHold")}
							onPress={onPlaceHold}
							style={({ pressed }) => [
								styles.placeBtn,
								{ borderColor: k.dangerText, opacity: pressed ? 0.7 : 1 },
							]}
						>
							<Ionicons
								name="pause-circle-outline"
								size={18}
								color={k.dangerText}
							/>
							<Text style={[styles.placeBtnText, { color: k.dangerText }]}>
								{t("moderation.paymentsPlaceHold")}
							</Text>
						</Pressable>
					) : undefined
				}
			>
				{t("moderation.paymentsHoldsTitle")}
			</SectionTitle>

			{holds.length === 0 ? (
				<Text style={[styles.empty, { color: c.muted }]}>
					{t("moderation.paymentsHoldsEmpty")}
				</Text>
			) : (
				holds.map((hold) => (
					<View
						key={hold.id}
						style={[
							styles.row,
							{ backgroundColor: c.warningSoft, borderColor: k.warningText },
						]}
					>
						<View style={styles.head}>
							<Ionicons name="pause-circle" size={20} color={k.warningText} />
							<Text style={[styles.title, { color: c.text }]}>
								{t(MODERATION_HOLD_REASON_LABELS[hold.reason])}
								{hold.orderId ? ` · ${hold.orderId}` : ""}
							</Text>
						</View>
						<Text style={[styles.meta, { color: c.text }]}>
							{hold.createdByType === "system"
								? t("moderation.paymentsHoldPlacedBySystem")
								: t("moderation.paymentsHoldPlacedByModerator")}
							{" · "}
							{formatDate(hold.createdAt)}
						</Text>
						{hold.blocksCharges ? (
							<Text style={[styles.strong, { color: k.dangerText }]}>
								{t("moderation.paymentsHoldBlocks")}
							</Text>
						) : null}
						{hold.note ? (
							<Text style={[styles.meta, { color: c.text }]}>{hold.note}</Text>
						) : null}
						{actionable ? (
							<DecisionButton
								variant="secondary"
								icon="play-circle-outline"
								label={t("moderation.paymentsReleaseHold")}
								onPress={() => onReleaseHold(hold.id)}
								disabled={releasePending}
								grow={0}
								style={styles.release}
							/>
						) : null}
					</View>
				))
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	section: { gap: 8 },
	empty: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	placeBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 48,
		borderWidth: 1.5,
		borderRadius: 12,
		paddingHorizontal: 12,
	},
	placeBtnText: { fontSize: 14, fontFamily: Fonts.bodyBold },
	row: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 14,
		padding: 14,
		gap: 6,
	},
	head: { flexDirection: "row", alignItems: "center", gap: 8 },
	title: {
		flex: 1,
		fontSize: 15,
		lineHeight: 20,
		fontFamily: Fonts.bodySemibold,
	},
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	strong: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
	release: { marginTop: 6 },
});
