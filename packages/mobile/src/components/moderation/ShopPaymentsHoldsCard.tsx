import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import { MODERATION_HOLD_REASON_LABELS } from "@/src/lib/moderationPayments";
import type { ShopPaymentsHold } from "@/src/types/api";
import type { ModerationPalette, Translate } from "./theme";

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
	return (
		<View style={{ gap: 10 }}>
			<View style={styles.header}>
				<Text style={[styles.sectionLabel, { color: c.muted }]}>
					{t("moderation.paymentsHoldsTitle")}
				</Text>
				{actionable ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("moderation.paymentsPlaceHold")}
						onPress={onPlaceHold}
						style={[styles.placeBtn, { borderColor: c.primary }]}
					>
						<Text style={[styles.placeBtnText, { color: c.primary }]}>
							{t("moderation.paymentsPlaceHold")}
						</Text>
					</Pressable>
				) : null}
			</View>

			{holds.length === 0 ? (
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("moderation.paymentsHoldsEmpty")}
				</Text>
			) : (
				holds.map((hold) => (
					<View key={hold.id} style={[styles.row, { borderColor: c.warning }]}>
						<View style={{ flex: 1, gap: 2 }}>
							<Text style={[styles.body, { color: c.text }]}>
								{t(MODERATION_HOLD_REASON_LABELS[hold.reason])}
								{hold.orderId ? ` · ${hold.orderId}` : ""}
							</Text>
							<Text style={[styles.meta, { color: c.muted }]}>
								{hold.createdByType === "system"
									? t("moderation.paymentsHoldPlacedBySystem")
									: t("moderation.paymentsHoldPlacedByModerator")}
								{" · "}
								{formatDate(hold.createdAt)}
							</Text>
							{hold.blocksCharges ? (
								<Text style={[styles.meta, { color: c.danger }]}>
									{t("moderation.paymentsHoldBlocks")}
								</Text>
							) : null}
							{hold.note ? (
								<Text style={[styles.meta, { color: c.muted }]}>
									{hold.note}
								</Text>
							) : null}
						</View>
						{actionable ? (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={t("moderation.paymentsReleaseHold")}
								onPress={() => onReleaseHold(hold.id)}
								disabled={releasePending}
								style={[styles.releaseBtn, { backgroundColor: c.success }]}
							>
								<Text style={styles.releaseBtnText}>
									{t("moderation.paymentsReleaseHold")}
								</Text>
							</Pressable>
						) : null}
					</View>
				))
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	sectionLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	body: { fontSize: 14, fontFamily: Fonts.body },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		padding: 10,
	},
	placeBtn: {
		borderWidth: 1.5,
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	placeBtnText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	releaseBtn: {
		minHeight: 36,
		borderRadius: 10,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	releaseBtnText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		color: "#fff",
	},
});
