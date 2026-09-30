import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { ReturnOutcome } from "@/src/components/verification/ReturnOutcome";
import { useVerificationReturn } from "@/src/hooks/useVerificationReturn";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";

export default function VerificationReturnScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { requestId, query, outcome, onRefresh } = useVerificationReturn();

	const onRetry = () =>
		router.replace("/seller/verification/identity" as never);
	const onBackToHub = () => router.replace("/seller/verification" as never);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("verification.return.title")}
				onBack={onBackToHub}
			/>

			{!requestId ? (
				<EmptyState
					illustration="notFound"
					title={t("verification.return.missing.title")}
					subtitle={t("verification.return.missing.body")}
					ctaLabel={t("verification.return.backToHub")}
					onCta={onBackToHub}
				/>
			) : query.isError ? (
				<View style={styles.center}>
					<Text style={[styles.body, { color: c.text }]}>
						{resolveErrorMessage(query.error, t)}
					</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("common.retry")}
						onPress={onRefresh}
						style={[styles.button, { backgroundColor: c.primary }]}
					>
						<Text style={styles.buttonLabel}>{t("common.retry")}</Text>
					</Pressable>
				</View>
			) : (
				<View style={styles.center}>
					<ReturnOutcome
						outcome={outcome}
						onRetry={onRetry}
						onRefresh={onRefresh}
					/>

					{outcome.kind !== "polling" ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("verification.return.backToHub")}
							onPress={onBackToHub}
							style={styles.linkButton}
						>
							<Text style={[styles.linkLabel, { color: c.primary }]}>
								{t("verification.return.backToHub")}
							</Text>
						</Pressable>
					) : null}
				</View>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		padding: 24,
	},
	body: { fontSize: 14, fontFamily: Fonts.body, textAlign: "center" },
	button: {
		minHeight: 44,
		minWidth: 44,
		paddingHorizontal: 20,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 8,
	},
	buttonLabel: {
		color: "#ffffff",
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},
	linkButton: {
		minHeight: 44,
		minWidth: 44,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	linkLabel: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
