import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { formStyles as f } from "@/src/components/seller/formStyles";
import { useBrandFor } from "@/src/components/shop/brand";
import {
	BRAND_SWATCHES,
	parseBrandColorInput,
} from "@/src/components/shop/brandTones";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useUpdateShop } from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { MyShop } from "@/src/types/api";

/** The shop's brand colour: swatches or a hex code, previewed before saving. */
export function ShopBrandColorCard({
	shop,
	readOnly,
}: {
	shop: MyShop;
	readOnly: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showError, showSuccess } = useAlert();
	const updateShop = useUpdateShop(shop.id);
	const saved = shop.brandColor ?? null;
	const [draft, setDraft] = useState(saved ?? "");
	const parsed = parseBrandColorInput(draft);
	const preview = useBrandFor(parsed.ok ? parsed.value : saved);
	const dirty = parsed.ok && parsed.value !== saved;
	const disabled = readOnly || updateShop.isPending;

	const save = async () => {
		if (!parsed.ok) return;
		try {
			await updateShop.mutateAsync({ brandColor: parsed.value });
			showSuccess(t("shop.brandColorSaved"));
		} catch (error) {
			showError(t("shop.saveError"), resolveErrorMessage(error, t));
		}
	};

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<Text style={[f.sectionTitle, { color: c.text }]}>
				{t("shop.brandColorTitle")}
			</Text>
			<Text style={[f.hint, { color: c.muted }]}>
				{t("shop.brandColorHint")}
			</Text>

			<View style={styles.swatches}>
				{BRAND_SWATCHES.map((swatch) => {
					const selected = parsed.ok && parsed.value === swatch;
					return (
						<Pressable
							key={swatch}
							disabled={disabled}
							onPress={() => setDraft(swatch)}
							accessibilityRole="radio"
							accessibilityState={{ selected }}
							accessibilityLabel={t("shop.brandColorSwatch", {
								color: swatch,
							})}
							style={[
								styles.swatch,
								{
									backgroundColor: swatch,
									borderColor: selected ? c.text : "transparent",
								},
							]}
						>
							{selected ? (
								<Ionicons name="checkmark" size={18} color="#fff" />
							) : null}
						</Pressable>
					);
				})}
			</View>

			<Text style={[f.label, { color: c.body }]}>
				{t("shop.brandColorCustom")}
			</Text>
			<TextInput
				value={draft}
				onChangeText={setDraft}
				editable={!disabled}
				autoCapitalize="characters"
				autoCorrect={false}
				maxLength={7}
				placeholder="#1E40AF"
				placeholderTextColor={c.muted}
				accessibilityLabel={t("shop.brandColorCustom")}
				style={[
					f.input,
					{
						color: c.text,
						backgroundColor: c.input,
						borderColor: parsed.ok ? c.border : c.danger,
					},
				]}
			/>
			{parsed.ok ? null : (
				<Text style={f.error}>{t("shop.brandColorInvalid")}</Text>
			)}

			<Text style={[f.label, { color: c.body }]}>
				{t("shop.brandColorPreview")}
			</Text>
			<View style={[styles.preview, { borderColor: c.border }]}>
				<View style={[styles.band, { backgroundColor: preview.headerBg }]}>
					<Text style={[styles.bandName, { color: preview.headerFg }]}>
						{shop.name}
					</Text>
					<Text style={[styles.bandMeta, { color: preview.headerMuted }]}>
						{t("shop.productsLabel")}
					</Text>
				</View>
				<View style={[styles.previewBody, { backgroundColor: c.bg }]}>
					<View style={[styles.button, { backgroundColor: preview.accent }]}>
						<Text style={[styles.buttonText, { color: preview.onAccent }]}>
							{t("shop.whatsapp")}
						</Text>
					</View>
					<View style={[styles.chip, { backgroundColor: preview.accentSoft }]}>
						<Text style={[styles.chipText, { color: preview.accentText }]}>
							{t("shop.brandColorChip")}
						</Text>
					</View>
				</View>
			</View>

			<View style={f.row}>
				<Pressable
					disabled={disabled || draft === ""}
					onPress={() => setDraft("")}
					accessibilityRole="button"
					accessibilityLabel={t("shop.brandColorReset")}
					style={[
						styles.action,
						{ borderColor: c.border, opacity: draft === "" ? 0.5 : 1 },
					]}
				>
					<Text style={[styles.actionText, { color: c.body }]}>
						{t("shop.brandColorReset")}
					</Text>
				</Pressable>
				<Pressable
					disabled={disabled || !dirty}
					onPress={save}
					accessibilityRole="button"
					accessibilityLabel={t("shop.save")}
					style={[
						styles.action,
						{
							backgroundColor: c.primary,
							borderColor: c.primary,
							opacity: disabled || !dirty ? 0.5 : 1,
						},
					]}
				>
					{updateShop.isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={[styles.actionText, { color: "#fff" }]}>
							{t("shop.save")}
						</Text>
					)}
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	swatch: {
		width: 44,
		height: 44,
		borderRadius: 22,
		borderWidth: 3,
		alignItems: "center",
		justifyContent: "center",
	},
	preview: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
	band: { paddingHorizontal: 14, paddingVertical: 16, gap: 2 },
	bandName: { fontSize: 16, fontFamily: Fonts.displayBold },
	bandMeta: { fontSize: 12, fontFamily: Fonts.body },
	previewBody: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		padding: 12,
	},
	button: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
	buttonText: { fontSize: 13, fontFamily: Fonts.displayBold },
	chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
	chipText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	action: {
		flex: 1,
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	actionText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
