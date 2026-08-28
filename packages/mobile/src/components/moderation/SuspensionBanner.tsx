import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useAuth } from "@/src/lib/auth";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { suspensionOf } from "@/src/lib/moderation";
import { useModerationTheme } from "./theme";

/**
 * Tells a suspended account what happened and when it ends. Without it the
 * only signal is publishing and messaging failing, which reads as a broken
 * app rather than a sanction — and is what turns a moderation decision into
 * a store complaint.
 */
export function SuspensionBanner() {
	const { user } = useAuth();
	const { t } = useTranslation();
	const c = useModerationTheme();
	const suspension = suspensionOf(user);

	if (!suspension.active) return null;

	const until = suspension.until ? formatDate(suspension.until) : null;

	return (
		<View
			style={[
				styles.banner,
				{ backgroundColor: c.dangerSoft, borderColor: c.danger },
			]}
		>
			<Ionicons name="alert-circle" size={20} color={c.danger} />
			<View style={{ flex: 1, gap: 3 }}>
				<Text style={[styles.title, { color: c.danger }]}>
					{t("moderation.bannerTitle")}
				</Text>
				<Text style={[styles.body, { color: c.text }]}>
					{suspension.indefinite || !until
						? t("moderation.bannerIndefinite")
						: t("moderation.bannerUntil", { date: until })}
				</Text>
				{user?.suspendedReason ? (
					<Text style={[styles.reason, { color: c.muted }]}>
						{t(`report.${user.suspendedReason}`)}
					</Text>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	banner: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		borderRadius: 14,
		borderWidth: 1,
		padding: 14,
		marginBottom: 16,
	},
	title: { fontSize: 14, fontFamily: Fonts.displayBold },
	body: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 19 },
	reason: { fontSize: 12, fontFamily: Fonts.body },
});
