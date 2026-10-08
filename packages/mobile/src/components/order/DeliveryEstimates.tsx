import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useAppConfig } from "../../contexts/AppConfigContext";
import { useDeliveryEstimates } from "../../hooks/useDeliveryEstimates";
import { useTranslation } from "../../lib/i18n";
import { formatXaf } from "../../lib/orderMoney";
import { SkeletonRow } from "../SkeletonCard";
import { useShopTheme } from "../shop/theme";

export function DeliveryEstimates({
	listingId,
	eligible,
}: {
	listingId: string;
	eligible: boolean;
}) {
	const { t, i18n } = useTranslation();
	const c = useShopTheme();
	const locale = i18n.language.startsWith("fr") ? "fr" : "en";
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	const query = useDeliveryEstimates(listingId, eligible);
	if (!eligible || !ordersEnabled || !deliveryZonesEnabled) return null;
	if (query.isPending)
		return (
			<View
				accessibilityLabel={t("buyBox.estimateLoading")}
				style={styles.spacing}
			>
				<SkeletonRow />
			</View>
		);
	if (query.isError)
		return (
			<Text style={[styles.notice, { color: c.muted }]}>
				{t("buyBox.estimateUnavailable")}
			</Text>
		);
	if (!query.data?.perMethod.length) return null;
	return (
		<View
			accessibilityLabel={t("buyBox.estimateTitle")}
			style={[
				styles.box,
				{ borderColor: c.border, backgroundColor: c.neutralSoft },
			]}
		>
			<Ionicons name="car-outline" size={18} color={c.primary} />
			<View style={styles.content}>
				{query.data.perMethod.map((option) => (
					<Text key={option.method} style={[styles.line, { color: c.body }]}>
						{t("buyBox.estimateCost", {
							method: t(`buyBox.estimateMethod_${option.method}`),
							fee:
								option.cheapestFee === 0
									? t("buyBox.estimateFree")
									: formatXaf(option.cheapestFee, locale),
							min: option.etaMinHours,
							max: option.etaMaxHours,
						})}
					</Text>
				))}
				<Text style={[styles.notice, { color: c.muted }]}>
					{t("buyBox.estimateNotice")}
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	spacing: { marginVertical: 12 },
	box: {
		flexDirection: "row",
		gap: 10,
		padding: 14,
		marginVertical: 12,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 14,
	},
	content: { flex: 1, gap: 4 },
	line: { fontFamily: Fonts.body, fontSize: 13 },
	notice: { fontFamily: Fonts.body, fontSize: 12 },
});
