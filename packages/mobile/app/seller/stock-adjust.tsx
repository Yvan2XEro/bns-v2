import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Controller } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { MovementTypePicker } from "@/src/components/seller/MovementTypePicker";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useStockAdjustForm } from "@/src/hooks/useStockAdjustForm";
import { useTranslation } from "@/src/lib/i18n";
import { STOCK_NOTE_MAX } from "@/src/lib/stockAdjust";
import { variantLabel } from "@/src/lib/variants";

export default function StockAdjustSheet() {
	const { variantId } = useLocalSearchParams<{ variantId: string }>();
	const c = useShopTheme();
	const { t } = useTranslation();
	const {
		variant,
		v,
		current,
		form,
		type,
		result,
		changeType,
		submit,
		isPending,
	} = useStockAdjustForm(variantId);

	const inputStyle = [
		styles.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];
	const amountError = form.formState.errors.amount?.message;
	const unitCostError = form.formState.errors.unitCost?.message;

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.card }]}>
			<SellerHeader
				title={t("stock.adjustTitle")}
				icon="close"
				onBack={() => router.back()}
			/>

			{!variantId || variant.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("stock.loadErrorTitle")}
					subtitle={t("stock.loadErrorBody")}
					ctaLabel={t("common.close")}
					onCta={() => router.back()}
				/>
			) : variant.isLoading || !v ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : (
				<KeyboardAwareScrollView
					contentContainerStyle={{ padding: 16, gap: 14 }}
					keyboardShouldPersistTaps="handled"
				>
					<View>
						<Text style={[styles.product, { color: c.text }]}>
							{[
								v.product.title,
								variantLabel(v.optionValues ?? {}, v.product.options),
							]
								.filter(Boolean)
								.join(" · ")}
						</Text>
						<Text style={[styles.meta, { color: c.muted }]}>
							{v.lowStockThreshold !== null
								? t("stock.currentWithThreshold", {
										count: current,
										threshold: v.lowStockThreshold,
									})
								: t("stock.current", { count: current })}
						</Text>
					</View>

					{!v.trackInventory ? (
						<View style={[styles.notice, { backgroundColor: c.warningSoft }]}>
							<Ionicons
								name="information-circle-outline"
								size={16}
								color={c.warningText}
							/>
							<Text style={[styles.noticeText, { color: c.warningText }]}>
								{t("stock.trackingNote")}
							</Text>
						</View>
					) : null}

					<MovementTypePicker value={type} onChange={changeType} />

					<Text style={[styles.label, { color: c.body }]}>
						{t(`stock.valueLabel_${type}`)}
					</Text>
					<Controller
						control={form.control}
						name="amount"
						render={({ field }) => (
							<TextInput
								value={field.value}
								onChangeText={field.onChange}
								onBlur={field.onBlur}
								keyboardType="number-pad"
								accessibilityLabel={t(`stock.valueLabel_${type}`)}
								style={inputStyle}
							/>
						)}
					/>
					{amountError ? (
						<Text style={[styles.meta, { color: c.danger }]}>
							{t(amountError)}
						</Text>
					) : null}

					{type === "receipt" ? (
						<>
							<Text style={[styles.label, { color: c.body }]}>
								{t("stock.unitCost")}
							</Text>
							<Controller
								control={form.control}
								name="unitCost"
								render={({ field }) => (
									<TextInput
										value={field.value}
										onChangeText={field.onChange}
										onBlur={field.onBlur}
										keyboardType="number-pad"
										placeholder="XAF"
										placeholderTextColor={c.muted}
										accessibilityLabel={t("stock.unitCost")}
										style={inputStyle}
									/>
								)}
							/>
							{unitCostError ? (
								<Text style={[styles.meta, { color: c.danger }]}>
									{t(unitCostError)}
								</Text>
							) : null}
						</>
					) : null}

					<Text style={[styles.label, { color: c.body }]}>
						{t("stock.note")}
					</Text>
					<Controller
						control={form.control}
						name="note"
						render={({ field }) => (
							<TextInput
								value={field.value}
								onChangeText={field.onChange}
								onBlur={field.onBlur}
								maxLength={STOCK_NOTE_MAX}
								placeholder={t("stock.notePlaceholder")}
								placeholderTextColor={c.muted}
								accessibilityLabel={t("stock.note")}
								style={inputStyle}
							/>
						)}
					/>

					<View style={[styles.after, { backgroundColor: c.neutralSoft }]}>
						<Text style={[styles.meta, { color: c.body }]}>
							{t("stock.after")}
						</Text>
						<Text style={[styles.afterValue, { color: c.text }]}>
							{current} → {result ? result.stockAfter : "—"}
						</Text>
					</View>

					<Pressable
						onPress={submit}
						disabled={!result || Boolean(unitCostError) || isPending}
						accessibilityRole="button"
						accessibilityLabel={t(`stock.submit_${type}`)}
						style={[
							styles.submit,
							{
								backgroundColor: c.primary,
								opacity: result && !unitCostError ? 1 : 0.5,
							},
						]}
					>
						{isPending ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.submitText}>{t(`stock.submit_${type}`)}</Text>
						)}
					</Pressable>
				</KeyboardAwareScrollView>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	product: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	notice: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		padding: 10,
		borderRadius: 10,
	},
	noticeText: { flex: 1, fontSize: 12, fontFamily: Fonts.bodySemibold },
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	input: {
		height: 48,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 12,
		fontSize: 16,
		fontFamily: Fonts.body,
	},
	after: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 14,
		borderRadius: 12,
	},
	afterValue: { fontSize: 18, fontFamily: Fonts.displayBold },
	submit: {
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	submitText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
