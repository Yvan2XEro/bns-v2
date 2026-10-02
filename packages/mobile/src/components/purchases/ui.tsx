import type { ReactNode } from "react";
import {
	ActivityIndicator,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { type ShopPalette, useShopTheme } from "../shop/theme";

export type ButtonTone = "primary" | "outline" | "danger";

function toneColors(c: ShopPalette, tone: ButtonTone) {
	if (tone === "primary")
		return { bg: c.primary, fg: "#ffffff", border: c.primary };
	if (tone === "danger")
		return { bg: c.dangerSoft, fg: c.dangerText, border: c.dangerSoft };
	return { bg: "transparent", fg: c.primary, border: c.border };
}

/** A 44px-minimum button; `label` doubles as its accessibility label. */
export function PurchaseButton({
	label,
	onPress,
	tone = "primary",
	pending = false,
	disabled = false,
}: {
	label: string;
	onPress: () => void;
	tone?: ButtonTone;
	pending?: boolean;
	disabled?: boolean;
}) {
	const c = useShopTheme();
	const colors = toneColors(c, tone);
	const off = disabled || pending;
	return (
		<Pressable
			onPress={onPress}
			disabled={off}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: off, busy: pending }}
			style={[
				styles.button,
				{
					backgroundColor: colors.bg,
					borderColor: colors.border,
					opacity: off ? 0.6 : 1,
				},
			]}
		>
			{pending ? (
				<ActivityIndicator color={colors.fg} />
			) : (
				<Text style={[styles.buttonText, { color: colors.fg }]}>{label}</Text>
			)}
		</Pressable>
	);
}

export function Card({
	title,
	children,
	accent,
}: {
	title?: string;
	children: ReactNode;
	accent?: string;
}) {
	const c = useShopTheme();
	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: c.card,
					borderColor: accent ?? c.border,
					borderWidth: accent ? 2 : StyleSheet.hairlineWidth,
				},
			]}
		>
			{title ? (
				<Text style={[styles.cardTitle, { color: c.text }]}>{title}</Text>
			) : null}
			{children}
		</View>
	);
}

export function FieldError({ message }: { message?: string | null }) {
	const c = useShopTheme();
	if (!message) return null;
	return (
		<Text accessibilityRole="alert" style={[styles.error, { color: c.danger }]}>
			{message}
		</Text>
	);
}

/** A bottom sheet: the dialogs of the action bar. */
export function Sheet({
	visible,
	title,
	body,
	onClose,
	closeLabel,
	children,
}: {
	visible: boolean;
	title: string;
	body?: string | null;
	onClose: () => void;
	closeLabel: string;
	children: ReactNode;
}) {
	const c = useShopTheme();
	return (
		<Modal
			visible={visible}
			transparent
			animationType="slide"
			onRequestClose={onClose}
		>
			<Pressable
				style={[
					styles.backdrop,
					{
						backgroundColor: c.isDark
							? "rgba(0,0,0,0.6)"
							: "rgba(15,23,42,0.4)",
					},
				]}
				onPress={onClose}
				accessibilityRole="button"
				accessibilityLabel={closeLabel}
			/>
			<View
				style={[
					styles.sheet,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<ScrollView
					contentContainerStyle={styles.sheetContent}
					keyboardShouldPersistTaps="handled"
				>
					<Text style={[styles.sheetTitle, { color: c.text }]}>{title}</Text>
					{body ? (
						<Text style={[styles.body, { color: c.body }]}>{body}</Text>
					) : null}
					{children}
					<PurchaseButton label={closeLabel} tone="outline" onPress={onClose} />
				</ScrollView>
			</View>
		</Modal>
	);
}

export const purchaseText = StyleSheet.create({
	body: { fontSize: 14, fontFamily: Fonts.body, lineHeight: 20 },
	muted: { fontSize: 13, fontFamily: Fonts.body },
	strong: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});

const styles = StyleSheet.create({
	button: {
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	buttonText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	card: { borderRadius: 16, padding: 16, gap: 10 },
	cardTitle: { fontSize: 16, fontFamily: Fonts.displayBold },
	error: { fontSize: 13, fontFamily: Fonts.body },
	body: { fontSize: 14, fontFamily: Fonts.body, lineHeight: 20 },
	backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
	sheet: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		maxHeight: "85%",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
	},
	sheetContent: { padding: 20, gap: 12, paddingBottom: 32 },
	sheetTitle: { fontSize: 17, fontFamily: Fonts.displayBold },
});
