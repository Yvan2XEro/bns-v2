import { type Dispatch, type SetStateAction, useMemo } from "react";
import { Text, TextInput, View } from "react-native";
import { CategoryField } from "@/src/components/CategorySheet";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCategories } from "@/src/hooks/useListings";
import type { PhotoUploads } from "@/src/hooks/usePhotoUploads";
import { type FieldIssue, issueAt } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import {
	getCategoryAttributes,
	groupListingAttributes,
	isProductListingCategory,
	type ListingAttribute,
} from "@/src/lib/listingForm";
import type { ProductFormState } from "@/src/lib/productForm";
import { FieldIssueText, ISSUE_BORDER } from "./FieldIssueText";
import { formStyles as f } from "./formStyles";
import { ProductAttributeInput } from "./ProductAttributeInput";
import { ProductPhotosCard } from "./ProductPhotosCard";

export function ProductInfoStep({
	form,
	setForm,
	uploads,
	readOnly,
	issues = [],
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	uploads: PhotoUploads;
	/** A shop that cannot edit: the fields read as values, nothing uploads. */
	readOnly?: boolean;
	/** What the server would refuse on this step, once the seller tried to move on. */
	issues?: FieldIssue[];
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const categories = useCategories();
	// Only goods go in the catalogue (the API refuses the rest); a product
	// filed elsewhere before that rule keeps its own category on offer.
	const currentCategoryId = form.category?.id;
	const sellable = useMemo(
		() =>
			(categories.data?.categories ?? []).filter(
				(category) =>
					isProductListingCategory(category) ||
					category.id === currentCategoryId,
			),
		[categories.data, currentCategoryId],
	);
	const attributes: ListingAttribute[] = getCategoryAttributes(form.category);
	const inputStyle = [
		f.input,
		readOnly
			? {
					color: c.muted,
					backgroundColor: c.neutralSoft,
					borderColor: c.border,
				}
			: { color: c.text, backgroundColor: c.input, borderColor: c.border },
	];
	const flagged = (path: string) =>
		issueAt(issues, path) ? { borderColor: ISSUE_BORDER } : null;

	const setAttr = (slug: string, value: string) =>
		setForm((s) => ({ ...s, attributes: { ...s.attributes, [slug]: value } }));

	return (
		<View style={{ gap: 14 }}>
			<ProductPhotosCard
				form={form}
				setForm={setForm}
				uploads={uploads}
				readOnly={readOnly}
			/>
			<FieldIssueText issue={issueAt(issues, "images")} />

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
					editable={!readOnly}
					maxLength={120}
					placeholder={t("product.titlePlaceholder")}
					placeholderTextColor={c.muted}
					style={[...inputStyle, flagged("title")]}
					accessibilityLabel={t("product.titleLabel")}
				/>
				<FieldIssueText issue={issueAt(issues, "title")} />

				<Text style={[f.label, { color: c.body }]}>
					{t("product.categoryLabel")} *
				</Text>
				<View
					pointerEvents={readOnly ? "none" : "auto"}
					accessibilityState={{ disabled: !!readOnly }}
				>
					<CategoryField
						categories={sellable}
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
							// Behind the sheet's white icon glyphs.
							fill: c.fill,
							link: c.link,
							border: c.border,
							isDark: c.isDark,
							inputBg: c.input,
						}}
					/>
				</View>
				<FieldIssueText issue={issueAt(issues, "category")} />

				{groupListingAttributes(attributes).map((section) => (
					<View key={section.key} style={{ gap: 10 }}>
						{section.title ? (
							<Text
								style={[f.sectionTitle, { color: c.text }]}
								accessibilityRole="header"
							>
								{section.title}
							</Text>
						) : null}
						{section.attributes.map((attr) => (
							<View key={attr.slug} pointerEvents={readOnly ? "none" : "auto"}>
								<ProductAttributeInput
									attribute={attr}
									value={form.attributes[attr.slug] ?? ""}
									onChange={(value) => setAttr(attr.slug, value)}
									issue={issueAt(issues, `attributes.${attr.slug}`)}
								/>
							</View>
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
					editable={!readOnly}
					maxLength={5000}
					multiline
					placeholder={t("product.descriptionPlaceholder")}
					placeholderTextColor={c.muted}
					style={[...inputStyle, f.multiline, flagged("description")]}
					accessibilityLabel={t("product.descriptionLabel")}
				/>
				<FieldIssueText issue={issueAt(issues, "description")} />
			</View>
		</View>
	);
}
