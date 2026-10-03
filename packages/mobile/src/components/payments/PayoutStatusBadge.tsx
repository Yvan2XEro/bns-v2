import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { PAYOUT_STATUSES, type PayoutStatus } from "@/src/lib/paymentStatus";

const TONE: Record<PayoutStatus, "neutral" | "success" | "warning" | "danger"> =
	{
		scheduled: "neutral",
		pending: "warning",
		sent: "warning",
		processing: "warning",
		complete: "success",
		failed: "danger",
		reversed: "danger",
		cancelled: "neutral",
	};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const tone: Record<string, { bg: string; fg: string }> = {
		neutral: { bg: c.neutralSoft, fg: c.neutralText },
		success: { bg: c.successSoft, fg: c.successText },
		warning: { bg: c.warningSoft, fg: c.warningText },
		danger: { bg: c.dangerSoft, fg: c.dangerText },
	};
	const picked = tone[TONE[status]] ?? tone.neutral;

	return (
		<View style={[styles.badge, { backgroundColor: picked?.bg }]}>
			<Text style={[styles.text, { color: picked?.fg }]}>
				{t(PAYOUT_STATUSES[status])}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	badge: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 3,
		alignSelf: "flex-start",
	},
	text: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
