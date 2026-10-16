import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { photoLimitStatus } from "@/src/lib/photoLimit";

/** « X / N photos », and once the limit is reached, that more are coming as an option. */
export function PhotoLimitNote({
	count,
	limit,
	color,
}: {
	count: number;
	limit: number;
	color: string;
}) {
	const { t } = useTranslation();
	const status = photoLimitStatus(count, limit);
	return (
		<View style={styles.wrap}>
			<Text style={[styles.count, { color }]}>
				{t("photoLimit.count", { count, max: status.max })}
			</Text>
			{status.full ? (
				<Text style={[styles.note, { color }]}>{t("photoLimit.moreSoon")}</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { marginTop: 8, gap: 2 },
	count: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	note: { fontSize: 12, fontFamily: Fonts.body },
});
