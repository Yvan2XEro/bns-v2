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
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { MovementTypePicker } from "@/src/components/seller/MovementTypePicker";
import { VariantSummaryCard } from "@/src/components/seller/VariantSummaryCard";
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
				<ScreenColumn width="reading">
					<KeyboardAwareScrollView
						contentContainerStyle={{ padding: 16, gap: 14 }}
						keyboardShouldPersistTaps="handled"
					>
						<VariantSummaryCard
							title={[
								v.product.title,
								variantLabel(v.optionValues ?? {}, v.product.options),
							]
								.filter(Boolean)
								.join(" · ")}
							current={current}
							lowStockThreshold={v.lowStockThreshold}
							tracked={v.trackInventory}
						/>

						<MovementTypePicker value={type} onChange={changeType} />

						<View style={styles.amountRow}>
							<Text style={[styles.label, styles.flex, { color: c.body }]}>
								{t(`stock.valueLabel_${type}`)}
							</Text>
							<Controller
								control={form.control}
								name="amount"
								render={({ field }) => {
									const value = Number.parseInt(field.value || "0", 10) || 0;
									return (
										<View style={styles.stepper}>
											<Pressable
												onPress={() =>
													field.onChange(String(Math.max(0, value - 1)))
												}
												accessibilityRole="button"
												accessibilityLabel={t("stock.decrease")}
												style={[
													styles.stepButton,
													{ backgroundColor: c.card, borderColor: c.border },
												]}
											>
												<Ionicons name="remove" size={22} color={c.text} />
											</Pressable>
											<TextInput
												value={field.value}
												onChangeText={field.onChange}
												onBlur={field.onBlur}
												keyboardType="number-pad"
												placeholder="0"
												placeholderTextColor={c.muted}
												accessibilityLabel={t(`stock.valueLabel_${type}`)}
												style={[styles.amountInput, { color: c.text }]}
											/>
											<Pressable
												onPress={() => field.onChange(String(value + 1))}
												accessibilityRole="button"
												accessibilityLabel={t("stock.increase")}
												style={[
													styles.stepButton,
													{
														backgroundColor: c.primary,
														borderColor: c.primary,
													},
												]}
											>
												<Ionicons name="add" size={22} color="#fff" />
											</Pressable>
										</View>
									);
								}}
							/>
						</View>
						{amountError ? (
							<Text style={[styles.meta, { color: c.danger }]}>
								{t(amountError)}
							</Text>
						) : null}

						<View style={styles.boxes}>
							{type === "receipt" ? (
								<View
									style={[
										styles.box,
										{
											backgroundColor: c.card,
											borderColor: unitCostError ? c.danger : c.border,
										},
									]}
								>
									<Text style={[styles.boxLabel, { color: c.muted }]}>
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
												style={[styles.boxInput, { color: c.text }]}
											/>
										)}
									/>
								</View>
							) : null}
							<View
								style={[
									styles.box,
									{ backgroundColor: c.card, borderColor: c.border },
								]}
							>
								<Text style={[styles.boxLabel, { color: c.muted }]}>
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
											style={[styles.boxInput, { color: c.text }]}
										/>
									)}
								/>
							</View>
						</View>
						{unitCostError ? (
							<Text style={[styles.meta, { color: c.danger }]}>
								{t(unitCostError)}
							</Text>
						) : null}

						<View style={[styles.after, { backgroundColor: c.primarySoft }]}>
							<Text style={[styles.afterLabel, { color: c.body }]}>
								{t("stock.after")}
							</Text>
							<Text style={[styles.afterValue, { color: c.primary }]}>
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
								<Text style={styles.submitText}>
									{t(`stock.submit_${type}`)}
								</Text>
							)}
						</Pressable>
					</KeyboardAwareScrollView>
				</ScreenColumn>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	after: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 14,
		borderRadius: 12,
	},
	afterLabel: { fontSize: 14, fontFamily: Fonts.body },
	afterValue: { fontSize: 22, fontFamily: Fonts.displayExtrabold },
	flex: { flex: 1 },
	amountRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
	stepButton: {
		width: 48,
		height: 48,
		borderRadius: 14,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	amountInput: {
		width: 72,
		textAlign: "center",
		fontSize: 28,
		fontFamily: Fonts.displayExtrabold,
		paddingVertical: 4,
	},
	boxes: { flexDirection: "row", gap: 10 },
	box: {
		flex: 1,
		borderRadius: 14,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 8,
		gap: 2,
	},
	boxLabel: { fontSize: 12, fontFamily: Fonts.body },
	boxInput: {
		fontSize: 15,
		fontFamily: Fonts.bodySemibold,
		paddingVertical: 2,
	},
	submit: {
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	submitText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
