import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useSheetPresentation } from "@/src/components/layout/sheetPresentation";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

/** The bottom-sheet shell every order action that needs input opens in. */
export function OrderSheet({
	visible,
	title,
	subtitle,
	onClose,
	children,
}: {
	visible: boolean;
	title: string;
	subtitle?: string;
	onClose: () => void;
	children: ReactNode;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const sheet = useSheetPresentation();
	return (
		<Modal
			visible={visible}
			transparent
			animationType={sheet.animationType}
			onRequestClose={onClose}
		>
			<Pressable
				style={[StyleSheet.absoluteFill, styles.backdrop]}
				onPress={onClose}
				accessibilityRole="button"
				accessibilityLabel={t("common.close")}
			/>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={sheet.wrap}
				pointerEvents="box-none"
			>
				<View style={[styles.sheet, { backgroundColor: c.card }, sheet.panel]}>
					<View style={styles.header}>
						<View style={styles.headerText}>
							<Text style={[styles.title, { color: c.text }]}>{title}</Text>
							{subtitle ? (
								<Text style={[styles.subtitle, { color: c.muted }]}>
									{subtitle}
								</Text>
							) : null}
						</View>
						<Pressable
							onPress={onClose}
							style={styles.close}
							accessibilityRole="button"
							accessibilityLabel={t("common.close")}
						>
							<Ionicons name="close" size={24} color={c.muted} />
						</Pressable>
					</View>
					<ScrollView
						keyboardShouldPersistTaps="handled"
						contentContainerStyle={styles.body}
					>
						{children}
					</ScrollView>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: { backgroundColor: "#0008" },
	sheet: {
		maxHeight: "88%",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingTop: 16,
	},
	header: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		paddingHorizontal: 20,
	},
	headerText: { flex: 1, gap: 4 },
	title: { fontSize: 18, fontFamily: Fonts.displayBold },
	subtitle: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
	close: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	body: { padding: 20, paddingBottom: 36, gap: 12 },
});
