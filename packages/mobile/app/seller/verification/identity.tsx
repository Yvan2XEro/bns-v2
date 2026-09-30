import { router } from "expo-router";
import { Controller } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { ConsentNotice } from "@/src/components/verification/ConsentNotice";
import { useIdentityConsentForm } from "@/src/hooks/useIdentityConsentForm";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";

export default function IdentityConsentScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const {
		myShop,
		shop,
		query,
		canProceed,
		isLoading,
		isError,
		form,
		checkboxError,
		onStart,
		startDisabled,
		isStarting,
	} = useIdentityConsentForm();

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("verification.identity.pageTitle")}
				onBack={() => router.back()}
			/>

			{isLoading ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : null}

			{!isLoading && isError ? (
				<View style={styles.center}>
					<Text style={[styles.errorText, { color: c.text }]}>
						{resolveErrorMessage(myShop.error ?? query.error, t)}
					</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("common.retry")}
						onPress={() => {
							void myShop.refetch();
							void query.refetch();
						}}
						style={[styles.retryBtn, { backgroundColor: c.primary }]}
					>
						<Text style={styles.retryLabel}>{t("common.retry")}</Text>
					</Pressable>
				</View>
			) : null}

			{!isLoading && !isError && myShop.data && !shop ? (
				<EmptyState
					illustration="sell"
					title={t("seller.noShopTitle")}
					subtitle={t("seller.noShopSubtitle")}
					ctaLabel={t("account.openShop")}
					onCta={() => router.replace("/shop/create" as never)}
				/>
			) : null}

			{!isLoading && !isError && query.data && !canProceed ? (
				<EmptyState
					illustration="notFound"
					title={t("verification.identity.blocked.title")}
					subtitle={t("verification.identity.blocked.body")}
					ctaLabel={t("verification.identity.blocked.backToHub")}
					onCta={() => router.replace("/seller/verification" as never)}
				/>
			) : null}

			{!isLoading && !isError && query.data && canProceed ? (
				<ScrollView
					contentContainerStyle={styles.content}
					keyboardShouldPersistTaps="handled"
				>
					{!query.data.enabled ? (
						<View style={[styles.banner, { backgroundColor: c.warningSoft }]}>
							<Text style={[styles.bannerText, { color: c.warningText }]}>
								{t("apiErrors.verification.disabled")}
							</Text>
						</View>
					) : null}

					<Controller
						control={form.control}
						name="accepted"
						render={({ field }) => (
							<ConsentNotice
								checked={field.value}
								onToggle={field.onChange}
								error={checkboxError}
							/>
						)}
					/>

					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("verification.identity.consent.start")}
						accessibilityState={{ disabled: startDisabled }}
						disabled={startDisabled}
						onPress={onStart}
						style={[
							styles.submit,
							{ backgroundColor: c.primary, opacity: startDisabled ? 0.5 : 1 },
						]}
					>
						{isStarting ? (
							<ActivityIndicator color="#ffffff" />
						) : (
							<Text style={styles.submitLabel}>
								{t("verification.identity.consent.start")}
							</Text>
						)}
					</Pressable>
				</ScrollView>
			) : null}
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
	errorText: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		textAlign: "center",
	},
	retryBtn: {
		minHeight: 44,
		minWidth: 44,
		paddingHorizontal: 20,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	retryLabel: {
		color: "#ffffff",
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},
	content: { padding: 16, gap: 16, paddingBottom: 40 },
	banner: { borderRadius: 12, padding: 12 },
	bannerText: { fontSize: 13, fontFamily: Fonts.body },
	submit: {
		minHeight: 48,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	submitLabel: {
		color: "#ffffff",
		fontSize: 16,
		fontFamily: Fonts.displayBold,
	},
});
