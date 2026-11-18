import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, shadows } from "@/constants/theme";
import { FormError } from "@/src/components/checkout/FormError";
import { useAlert } from "@/src/contexts/AlertContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { feedback } from "@/src/lib/feedback";
import { useTranslation } from "@/src/lib/i18n";
import { useDiscoveryPalette } from "./palette";

/**
 * "Save this search", floating over the results while a query or a filter is
 * set. A filled indigo pill with an ink shadow, clear of the grid's last row.
 */
export function SaveSearchButton({ onPress }: { onPress: () => void }) {
	const { t } = useTranslation();
	const c = useDiscoveryPalette();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={t("search.saveSearch")}
			style={({ pressed }) => [
				styles.fab,
				{ backgroundColor: c.primaryFill },
				pressed && styles.pressed,
			]}
		>
			<Ionicons name="bookmark-outline" size={18} color="#ffffff" />
			<Text style={styles.fabText}>{t("search.save")}</Text>
		</Pressable>
	);
}

/**
 * Names and saves the current search. Success closes the dialog and says so in
 * a toast; a refusal stays inside the dialog, under the field, so the name
 * typed is not lost.
 */
export function SaveSearchDialog({
	visible,
	onClose,
	query,
	searchParams,
	filters,
}: {
	visible: boolean;
	onClose: () => void;
	/** The free text searched, if any. */
	query: string;
	/** Everything the search URL carries (sort included; it is dropped). */
	searchParams: Record<string, string>;
	/** The filters stored with the saved search. */
	filters: Record<string, unknown>;
}) {
	const { t } = useTranslation();
	const c = useDiscoveryPalette();
	const insets = useSafeAreaInsets();
	const { isTablet, dialogMaxWidth } = useResponsive();
	const { showSuccess } = useAlert();
	const [name, setName] = useState("");
	const [focused, setFocused] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Every opening starts from the query, with no stale refusal.
	useEffect(() => {
		if (!visible) return;
		setName(query);
		setError(null);
	}, [visible, query]);

	const { mutate, isPending } = useMutation({
		mutationFn: () => {
			const urlParams = new URLSearchParams();
			if (query) urlParams.set("q", query);
			for (const [key, value] of Object.entries(searchParams)) {
				if (value && key !== "sort") urlParams.set(key, value);
			}
			return api.post("/api/saved-searches", {
				name: name.trim() || query || t("search.saveSearch"),
				query,
				filters,
				url: `/search?${urlParams.toString()}`,
			});
		},
		onSuccess: () => {
			onClose();
			feedback("success");
			showSuccess(t("search.searchSaved"));
		},
		onError: () => setError(t("errors.generic")),
	});

	const save = () => {
		if (isPending) return;
		setError(null);
		mutate();
	};

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={[
					styles.overlay,
					{ paddingBottom: insets.bottom + 16 },
					// A full-width sheet on an iPad reads as broken: centre it.
					isTablet && styles.overlayCentered,
				]}
			>
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={onClose}
					accessibilityRole="button"
					accessibilityLabel={t("common.close")}
				/>
				<View
					accessibilityViewIsModal
					style={[
						styles.card,
						{ backgroundColor: c.card, borderColor: c.border },
						isTablet && { width: "100%", maxWidth: dialogMaxWidth },
					]}
				>
					<Text
						style={[styles.title, { color: c.foreground }]}
						accessibilityRole="header"
					>
						{t("search.saveSearchTitle")}
					</Text>
					<Text style={[styles.sub, { color: c.body }]}>
						{t("search.saveSearchSub")}
					</Text>

					<TextInput
						value={name}
						onChangeText={setName}
						onFocus={() => setFocused(true)}
						onBlur={() => setFocused(false)}
						placeholder={t("search.saveSearchPlaceholderFallback")}
						placeholderTextColor={c.mutedForeground}
						accessibilityLabel={t("search.saveSearchName")}
						autoFocus
						maxLength={80}
						returnKeyType="done"
						onSubmitEditing={save}
						style={[
							styles.input,
							{
								color: c.foreground,
								backgroundColor: c.well,
								borderColor: focused ? c.primary : c.border,
							},
						]}
					/>
					<FormError message={error} />

					<View style={styles.actions}>
						<Pressable
							onPress={onClose}
							accessibilityRole="button"
							style={({ pressed }) => [
								styles.button,
								{ backgroundColor: c.well },
								pressed && styles.pressed,
							]}
						>
							<Text style={[styles.buttonText, { color: c.foreground }]}>
								{t("common.cancel")}
							</Text>
						</Pressable>
						<Pressable
							onPress={save}
							disabled={isPending}
							accessibilityRole="button"
							accessibilityState={{ busy: isPending, disabled: isPending }}
							style={({ pressed }) => [
								styles.button,
								{ backgroundColor: c.primaryFill },
								pressed && styles.pressed,
							]}
						>
							{isPending ? (
								<ActivityIndicator size="small" color="#ffffff" />
							) : (
								<Text style={[styles.buttonText, { color: "#ffffff" }]}>
									{t("search.save")}
								</Text>
							)}
						</Pressable>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	fab: {
		position: "absolute",
		bottom: 16,
		alignSelf: "center",
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minHeight: 48,
		paddingHorizontal: 20,
		borderRadius: 24,
		...shadows.lg,
	},
	fabText: {
		color: "#ffffff",
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
	},
	pressed: { opacity: 0.85 },

	overlay: {
		flex: 1,
		justifyContent: "flex-end",
		paddingHorizontal: 12,
		backgroundColor: "rgba(12, 16, 48, 0.55)",
	},
	overlayCentered: { justifyContent: "center", alignItems: "center" },
	card: {
		borderRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 20,
		gap: 12,
		...shadows.xl,
	},
	title: {
		fontSize: 20,
		lineHeight: 28,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
	},
	sub: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body, marginTop: -6 },
	input: {
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 14,
		paddingVertical: 10,
		fontSize: 16,
		fontFamily: Fonts.body,
	},
	actions: { flexDirection: "row", gap: 10, marginTop: 4 },
	button: {
		flex: 1,
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	buttonText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodyBold },
});
