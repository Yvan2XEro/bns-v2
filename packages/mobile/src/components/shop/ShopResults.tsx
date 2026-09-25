import { FlashList } from "@shopify/flash-list";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { useShopSearch } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import type { ShopSearchHit } from "@/src/types/api";
import { ShopCard } from "./ShopCard";
import { useShopTheme } from "./theme";

export function ShopResults({
	params,
	onClear,
}: {
	params: Record<string, string>;
	onClear: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const search = useShopSearch(params, true);
	const hits: ShopSearchHit[] =
		search.data?.pages.flatMap((p) => p?.hits ?? []) ?? [];
	const total = search.data?.pages[0]?.total ?? 0;

	if (search.isLoading) {
		return <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />;
	}
	if (search.isError) {
		// The shop index being down must never look like "no shop matches" —
		// that reads as a false negative rather than a service problem.
		return (
			<EmptyState
				icon="cloud-offline-outline"
				title={t("home.errorTitle")}
				subtitle={t("home.errorSub")}
				ctaLabel={t("common.retry")}
				onCta={() => search.refetch()}
			/>
		);
	}
	if (hits.length === 0) {
		return (
			<EmptyState
				illustration="searching"
				title={t("search.noShopsTitle")}
				subtitle={
					params.q
						? t("search.noShopsQuery", {
								q: params.q,
								city: params.city ?? t("search.everywhere"),
							})
						: t("search.noShopsHint")
				}
				ctaLabel={t("search.clearFilters")}
				onCta={onClear}
			/>
		);
	}

	return (
		<FlashList
			data={hits}
			keyExtractor={(hit) => hit.id}
			contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
			ListHeaderComponent={
				<Text style={[styles.count, { color: c.text }]}>
					{params.city
						? t("search.shopsCountIn", { count: total, city: params.city })
						: t("search.shopsCount", { count: total })}
				</Text>
			}
			ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
			renderItem={({ item }) => <ShopCard hit={item} />}
			onEndReached={() =>
				search.hasNextPage &&
				!search.isFetchingNextPage &&
				search.fetchNextPage()
			}
			onEndReachedThreshold={0.5}
		/>
	);
}

const styles = StyleSheet.create({
	count: { fontSize: 15, fontFamily: Fonts.displayBold, marginBottom: 4 },
});
