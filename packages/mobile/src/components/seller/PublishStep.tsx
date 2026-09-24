import { Ionicons } from "@expo/vector-icons";
import type { Dispatch, SetStateAction } from "react";
import {
	Pressable,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	View,
} from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { type ProductFormState, parseAmount } from "@/src/lib/productForm";
import { formatXafRange, priceRange } from "@/src/lib/variants";
import type { ProductStatus } from "@/src/types/api";
import { formStyles as f } from "./formStyles";

export function PublishStep({
	form,
	setForm,
	statuses,
	onEditInfo,
	readOnly,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	/** Creation offers active/draft; the editor adds archived ("Masqué"). */
	statuses: ProductStatus[];
	onEditInfo?: () => void;
	readOnly?: boolean;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const prices = form.variants
		.map((row) => parseAmount(row.price))
		.filter((p): p is number => p !== null);
	const range = priceRange(prices);
	const units = form.variants.reduce(
		(sum, row) =>
			sum +
			(row.id ? (row.stockOnHand ?? 0) : (parseAmount(row.initialStock) ?? 0)),
		0,
	);
	const inputStyle = [
		f.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];

	return (
		<View style={{ gap: 14 }}>
			{onEditInfo ? (
				<View
					style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}
				>
					<View style={f.row}>
						<View style={{ flex: 1, gap: 2 }}>
							<Text style={[f.sectionTitle, { color: c.text }]}>
								{form.title}
							</Text>
							<Text style={[f.hint, { color: c.muted }]}>
								{[
									form.category?.name,
									form.condition
										? t(
												`conditions.${form.condition === "like_new" ? "likeNew" : form.condition}`,
											)
										: null,
									t("product.variantsCount", { count: form.variants.length }),
								]
									.filter(Boolean)
									.join(" · ")}
							</Text>
							<Text style={[f.label, { color: c.text }]}>
								{range
									? formatXafRange(range.min, range.max, i18n.language)
									: "—"}{" "}
								· {t("product.unitsInStock", { count: units })}
							</Text>
						</View>
						<Pressable
							onPress={onEditInfo}
							hitSlop={12}
							style={styles.editButton}
							accessibilityRole="button"
							accessibilityLabel={t("product.edit")}
						>
							<Text style={[f.label, { color: c.primary }]}>
								{t("product.edit")}
							</Text>
						</Pressable>
					</View>
				</View>
			) : null}

			<View
				style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<Text style={[f.sectionTitle, { color: c.text }]}>
					{t("product.statusTitle")}
				</Text>
				{statuses.map((status) => {
					const active = form.status === status;
					return (
						<Pressable
							key={status}
							disabled={readOnly}
							onPress={() => setForm((s) => ({ ...s, status }))}
							style={[
								styles.radio,
								{
									borderColor: active ? c.primary : c.border,
									backgroundColor: active ? c.primarySoft : c.card,
								},
							]}
							accessibilityRole="radio"
							accessibilityLabel={t(`product.status_${status}`)}
							accessibilityState={{ selected: active }}
						>
							<Ionicons
								name={active ? "radio-button-on" : "radio-button-off"}
								size={20}
								color={active ? c.primary : c.muted}
							/>
							<View style={{ flex: 1 }}>
								<Text style={[f.label, { color: c.text }]}>
									{t(`product.status_${status}`)}
								</Text>
								<Text style={[f.hint, { color: c.muted }]}>
									{t(`product.status_${status}_hint`)}
								</Text>
							</View>
						</Pressable>
					);
				})}
				<View style={[styles.info, { backgroundColor: c.neutralSoft }]}>
					<Ionicons
						name="information-circle-outline"
						size={16}
						color={c.body}
					/>
					<Text style={[f.hint, { color: c.body, flex: 1 }]}>
						{t("product.listingAuto")}
					</Text>
				</View>
			</View>

			<View
				style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<Text style={[f.sectionTitle, { color: c.text }]}>
					{t("product.saleTitle")}
				</Text>
				<ToggleRow
					title={t("product.cod")}
					hint={t("product.codHint")}
					value={form.codAllowed}
					disabled={readOnly}
					onChange={(codAllowed) => setForm((s) => ({ ...s, codAllowed }))}
				/>
				<ToggleRow
					title={t("product.pickup")}
					hint={t("product.pickupHint")}
					value={form.pickupAllowed}
					disabled={readOnly}
					onChange={(pickupAllowed) =>
						setForm((s) => ({ ...s, pickupAllowed }))
					}
				/>
				<Text style={[f.label, { color: c.body }]}>
					{t("product.handling")}
				</Text>
				<TextInput
					value={form.handlingHours}
					editable={!readOnly}
					onChangeText={(v) =>
						setForm((s) => ({ ...s, handlingHours: v.replace(/\D/g, "") }))
					}
					keyboardType="number-pad"
					placeholder="24"
					placeholderTextColor={c.muted}
					style={inputStyle}
					accessibilityLabel={t("product.handling")}
				/>
				<Text style={[f.label, { color: c.body }]}>
					{t("product.returnPolicy")}
				</Text>
				<TextInput
					value={form.returnPolicy}
					editable={!readOnly}
					onChangeText={(returnPolicy) =>
						setForm((s) => ({ ...s, returnPolicy }))
					}
					multiline
					placeholder={t("product.returnPolicyPlaceholder")}
					placeholderTextColor={c.muted}
					style={[...inputStyle, f.multiline]}
					accessibilityLabel={t("product.returnPolicy")}
				/>
			</View>
		</View>
	);
}

function ToggleRow({
	title,
	hint,
	value,
	onChange,
	disabled,
}: {
	title: string;
	hint: string;
	value: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
}) {
	const c = useShopTheme();
	return (
		<View style={f.row}>
			<View style={{ flex: 1 }}>
				<Text style={[f.label, { color: c.text }]}>{title}</Text>
				<Text style={[f.hint, { color: c.muted }]}>{hint}</Text>
			</View>
			<Switch
				value={value}
				disabled={disabled}
				onValueChange={onChange}
				trackColor={{ true: c.primary, false: c.border }}
				accessibilityLabel={title}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	radio: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		padding: 12,
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
	},
	info: { flexDirection: "row", gap: 8, padding: 10, borderRadius: 10 },
	editButton: {
		minHeight: 44,
		minWidth: 44,
		alignItems: "flex-end",
		justifyContent: "center",
	},
});
