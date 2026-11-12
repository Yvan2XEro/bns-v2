import { ScrollView, StyleSheet } from "react-native";
import { useCategoryTags } from "@/src/hooks/useCategoryTags";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { formatAttributeOptionLabel } from "@/src/lib/listingAttributes";
import { formatPrice } from "@/src/lib/market";
import { Chip } from "./Chip";

type Params = Record<string, string | string[] | undefined>;
/** The route params a removal sets; `undefined` drops one. */
export type FilterPatch = Record<string, string | undefined>;

interface ActiveFilter {
	key: string;
	label: string;
	patch: FilterPatch;
}

const str = (value: string | string[] | undefined) =>
	typeof value === "string" && value ? value : "";

/**
 * Every active filter as its own chip under the sort bar, each one removable
 * with a tap. A count on the Filters button says "4"; this says which four,
 * and lets one go without reopening the whole sheet.
 */
export function ActiveFilters({
	params,
	categories,
	onRemove,
}: {
	params: Params;
	categories: any[];
	onRemove: (patch: FilterPatch) => void;
}) {
	const { t } = useTranslation();
	const category = str(params.category);
	const { tags: categoryTags } = useCategoryTags(category || null);
	const categoryObject = category
		? categories.find((cat) => String(cat.id) === category)
		: undefined;

	const attrKeys = Object.keys(params).filter(
		(key) => key.startsWith("attr_") && str(params[key]),
	);
	const filters: ActiveFilter[] = [];

	if (category) {
		const clearAttrs: FilterPatch = {};
		for (const key of attrKeys) clearAttrs[key] = undefined;
		filters.push({
			key: "category",
			label: categoryObject?.name ?? t("filters.category"),
			// Tags and attributes belong to the category: they go with it.
			patch: { category: undefined, tags: undefined, ...clearAttrs },
		});
	}

	const location = str(params.location);
	if (location) {
		const radius = str(params.radius);
		filters.push({
			key: "location",
			label: radius ? `${location} · ${radius} km` : location,
			patch: {
				location: undefined,
				radius: undefined,
				lat: undefined,
				lng: undefined,
			},
		});
	}

	const minPrice = str(params.minPrice);
	if (minPrice) {
		filters.push({
			key: "minPrice",
			label: `${t("common.min")} ${formatPrice(Number(minPrice), i18n.language)}`,
			patch: { minPrice: undefined },
		});
	}
	const maxPrice = str(params.maxPrice);
	if (maxPrice) {
		filters.push({
			key: "maxPrice",
			label: `${t("common.max")} ${formatPrice(Number(maxPrice), i18n.language)}`,
			patch: { maxPrice: undefined },
		});
	}

	const tagSlugs = category ? str(params.tags).split(",").filter(Boolean) : [];
	for (const slug of tagSlugs) {
		const rest = tagSlugs.filter((other) => other !== slug);
		filters.push({
			key: `tag-${slug}`,
			label: categoryTags.find((tag) => tag.slug === slug)?.name ?? slug,
			patch: { tags: rest.length ? rest.join(",") : undefined },
		});
	}

	if (params.verified === "1") {
		filters.push({
			key: "verified",
			label: t("filters.verified"),
			patch: { verified: undefined },
		});
	}
	if (params.orderable === "1") {
		filters.push({
			key: "orderable",
			label: t("filters.orderableLabel"),
			patch: { orderable: undefined },
		});
	}

	for (const key of attrKeys) {
		const value = str(params[key]);
		const slug = key.slice("attr_".length);
		const attr = (categoryObject?.attributes ?? []).find(
			(a: any) => a.slug === slug,
		);
		const option = attr?.options?.find((opt: any) => opt.value === value);
		const shown =
			attr?.type === "boolean"
				? value === "true"
					? t("common.yes")
					: t("common.no")
				: option
					? formatAttributeOptionLabel(option)
					: value;
		filters.push({
			key,
			label: attr?.name ? `${attr.name} : ${shown}` : shown,
			patch: { [key]: undefined },
		});
	}

	if (filters.length === 0) return null;

	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={styles.row}
			keyboardShouldPersistTaps="handled"
			accessibilityLabel={t("search.activeFilters")}
		>
			{filters.map((filter) => (
				<Chip
					key={filter.key}
					label={filter.label}
					selected
					trailingIcon="close"
					onPress={() => onRemove(filter.patch)}
					accessibilityLabel={t("search.removeFilter", {
						label: filter.label,
					})}
				/>
			))}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	row: {
		gap: 8,
		paddingHorizontal: 16,
		paddingTop: 10,
	},
});
