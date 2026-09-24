import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useAttachListings,
	useMyShop,
	usePersonalListings,
} from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { formatXaf } from "@/src/lib/variants";
import type { ListingDoc } from "@/src/types/api";

export default function MoveListingsScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { user } = useAuth();
	const { showError, showSuccess } = useAlert();
	const { data: mine } = useMyShop();
	const shop = mine?.shop;
	const attach = useAttachListings(shop?.id);
	const listings = usePersonalListings(user?.id);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const docs = useMemo(() => listings.data?.docs ?? [], [listings.data]);
	const allSelected = docs.length > 0 && selected.size === docs.length;

	const toggle = (id: string) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	const submit = () =>
		attach.mutate(
			{ listingIds: [...selected] },
			{
				onSuccess: (result) => {
					showSuccess(
						t("shop.movedTitle"),
						t("shop.movedMessage", {
							count: result.attached.length,
							skipped: result.skipped.length,
						}),
					);
					router.back();
				},
				onError: (error) =>
					showError(t("shop.moveError"), resolveErrorMessage(error, t)),
			},
		);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				icon="close"
				title={t("seller.stepMove")}
				subtitle={shop?.name}
			/>
			{listings.isLoading ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : docs.length === 0 ? (
				<EmptyState
					illustration="listings"
					title={t("shop.moveEmptyTitle")}
					subtitle={t("shop.moveEmptyBody")}
				/>
			) : (
				<FlatList
					data={docs}
					keyExtractor={(item) => item.id}
					contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 200 }}
					ListHeaderComponent={
						<View style={{ gap: 12, marginBottom: 4 }}>
							<Text style={[styles.body, { color: c.body }]}>
								{t("shop.moveIntro", { shop: shop?.name ?? "" })}
							</Text>
							<Pressable
								onPress={() =>
									setSelected(
										allSelected ? new Set() : new Set(docs.map((d) => d.id)),
									)
								}
								accessibilityRole="button"
								accessibilityLabel={t("shop.selectAll")}
								style={styles.row}
							>
								<Ionicons
									name={allSelected ? "checkbox" : "square-outline"}
									size={20}
									color={c.primary}
								/>
								<Text style={[styles.label, { color: c.text, flex: 1 }]}>
									{t("shop.selectAll")}
								</Text>
								<Text style={[styles.meta, { color: c.muted }]}>
									{t("shop.selectedCount", {
										count: selected.size,
										total: docs.length,
									})}
								</Text>
							</Pressable>
						</View>
					}
					renderItem={({ item }: { item: ListingDoc }) => {
						const active = selected.has(item.id);
						const uri = resolveListingImageUrl(item.images?.[0]);
						return (
							<Pressable
								onPress={() => toggle(item.id)}
								accessibilityRole="checkbox"
								accessibilityState={{ checked: active }}
								accessibilityLabel={item.title}
								style={[
									styles.item,
									{
										backgroundColor: c.card,
										borderColor: active ? c.primary : c.border,
									},
								]}
							>
								<Ionicons
									name={active ? "checkbox" : "square-outline"}
									size={20}
									color={active ? c.primary : c.muted}
								/>
								{uri ? (
									<Image
										source={{ uri }}
										style={styles.thumb}
										contentFit="cover"
									/>
								) : (
									<View
										style={[styles.thumb, { backgroundColor: c.neutralSoft }]}
									/>
								)}
								<View style={{ flex: 1 }}>
									<Text
										style={[styles.label, { color: c.text }]}
										numberOfLines={2}
									>
										{item.title}
									</Text>
									<Text style={[styles.meta, { color: c.muted }]}>
										{item.price ? formatXaf(item.price, i18n.language) : "—"} ·{" "}
										{t(`catalogue.listingStatus_${item.status}`)}
									</Text>
								</View>
							</Pressable>
						);
					}}
				/>
			)}

			{docs.length > 0 ? (
				<View
					style={[
						styles.footer,
						{ backgroundColor: c.card, borderTopColor: c.border },
					]}
				>
					{(["moveKeep", "moveLink", "moveStock"] as const).map((key) => (
						<View key={key} style={styles.row}>
							<Ionicons name="checkmark-circle" size={16} color={c.success} />
							<Text style={[styles.meta, { color: c.body }]}>
								{t(`shop.${key}`)}
							</Text>
						</View>
					))}
					<Pressable
						onPress={submit}
						disabled={selected.size === 0 || attach.isPending}
						accessibilityRole="button"
						accessibilityLabel={t("shop.moveSubmit", { count: selected.size })}
						style={[
							styles.submit,
							{ backgroundColor: c.primary, opacity: selected.size ? 1 : 0.5 },
						]}
					>
						{attach.isPending ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.submitText}>
								{t("shop.moveSubmit", { count: selected.size })}
							</Text>
						)}
					</Pressable>
					<Text style={[styles.meta, { color: c.muted, textAlign: "center" }]}>
						{t("shop.moveReversible")}
					</Text>
				</View>
			) : null}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	body: { fontSize: 14, fontFamily: Fonts.body, lineHeight: 20 },
	row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
	label: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	item: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		padding: 10,
		borderRadius: 14,
		borderWidth: 1,
		minHeight: 44,
	},
	thumb: { width: 52, height: 52, borderRadius: 10 },
	footer: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		gap: 6,
		padding: 16,
		paddingBottom: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	submit: {
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 6,
	},
	submitText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
