import type { Dispatch, SetStateAction } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { CategoryField } from "@/src/components/CategorySheet";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCategories } from "@/src/hooks/useListings";
import { useTranslation } from "@/src/lib/i18n";
import {
	getCategoryAttributes,
	getListingFormPreset,
	groupListingAttributes,
	type ListingAttribute,
} from "@/src/lib/listingForm";
import type { ProductFormState } from "@/src/lib/productForm";
import type { ListingCondition } from "@/src/types/api";
import { formStyles as f } from "./formStyles";
import { ProductAttributeInput } from "./ProductAttributeInput";
import { ProductPhotosCard } from "./ProductPhotosCard";

const CONDITIONS: ListingCondition[] = [
	"new",
	"like_new",
	"good",
	"fair",
	"poor",
];
const CONDITION_KEYS: Record<ListingCondition, string> = {
	new: "conditions.new",
	like_new: "conditions.likeNew",
	good: "conditions.good",
	fair: "conditions.fair",
	poor: "conditions.poor",
};

export function ProductInfoStep({
	form,
	setForm,
	showErrors,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	showErrors?: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const categories = useCategories();
	const preset = getListingFormPreset(form.category);
	const attributes: ListingAttribute[] = getCategoryAttributes(form.category);
	const inputStyle = [
		f.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];

	const setAttr = (slug: string, value: string) =>
		setForm((s) => ({ ...s, attributes: { ...s.attributes, [slug]: value } }));

	return (
		<View style={{ gap: 14 }}>
			<ProductPhotosCard form={form} setForm={setForm} />

			<View
				style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<View style={f.labelRow}>
					<Text style={[f.label, { color: c.body }]}>
						{t("product.titleLabel")} *
					</Text>
					<Text style={[f.counter, { color: c.muted }]}>
						{form.title.length} / 120
					</Text>
				</View>
				<TextInput
					value={form.title}
					onChangeText={(title) => setForm((s) => ({ ...s, title }))}
					maxLength={120}
					placeholder={t("product.titlePlaceholder")}
					placeholderTextColor={c.muted}
					style={inputStyle}
					accessibilityLabel={t("product.titleLabel")}
				/>
				{showErrors && form.title.trim().length < 3 ? (
					<Text style={f.error}>{t("product.titleError")}</Text>
				) : null}

				<Text style={[f.label, { color: c.body }]}>
					{t("product.categoryLabel")} *
				</Text>
				<CategoryField
					categories={categories.data?.categories ?? []}
					value={form.category}
					onSelect={(category) =>
						setForm((s) => ({ ...s, category, attributes: {} }))
					}
					onClear={() =>
						setForm((s) => ({ ...s, category: null, attributes: {} }))
					}
					colors={{
						cardBg: c.card,
						textColor: c.text,
						mutedColor: c.muted,
						primary: c.primary,
						border: c.border,
						isDark: c.isDark,
						inputBg: c.input,
					}}
				/>
				{showErrors && !form.category ? (
					<Text style={f.error}>{t("product.categoryError")}</Text>
				) : null}

				{preset.fields.condition.enabled ? (
					<>
						<Text style={[f.label, { color: c.body }]}>
							{t("product.conditionLabel")}
							{preset.fields.condition.required ? " *" : ""}
						</Text>
						<View style={f.chips}>
							{CONDITIONS.map((value) => {
								const active = form.condition === value;
								return (
									<Pressable
										key={value}
										onPress={() =>
											setForm((s) => ({
												...s,
												condition: active ? null : value,
											}))
										}
										style={[
											f.chip,
											{
												borderColor: active ? c.primary : c.border,
												backgroundColor: active ? c.primarySoft : c.card,
											},
										]}
										accessibilityRole="button"
										accessibilityLabel={t(CONDITION_KEYS[value])}
										accessibilityState={{ selected: active }}
									>
										<Text
											style={[
												f.chipText,
												{ color: active ? c.primary : c.body },
											]}
										>
											{t(CONDITION_KEYS[value])}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</>
				) : null}

				{groupListingAttributes(attributes).map((section) => (
					<View key={section.key} style={{ gap: 10 }}>
						{section.title ? (
							<Text style={[f.sectionTitle, { color: c.text }]}>
								{section.title}
							</Text>
						) : null}
						{section.attributes.map((attr) => (
							<ProductAttributeInput
								key={attr.slug}
								attribute={attr}
								value={form.attributes[attr.slug] ?? ""}
								onChange={(value) => setAttr(attr.slug, value)}
							/>
						))}
					</View>
				))}

				<View style={f.labelRow}>
					<Text style={[f.label, { color: c.body }]}>
						{t("product.descriptionLabel")}
					</Text>
					<Text style={[f.counter, { color: c.muted }]}>
						{form.description.length} / 5 000
					</Text>
				</View>
				<TextInput
					value={form.description}
					onChangeText={(description) =>
						setForm((s) => ({ ...s, description }))
					}
					maxLength={5000}
					multiline
					placeholder={t("product.descriptionPlaceholder")}
					placeholderTextColor={c.muted}
					style={[...inputStyle, f.multiline]}
					accessibilityLabel={t("product.descriptionLabel")}
				/>
			</View>
		</View>
	);
}
