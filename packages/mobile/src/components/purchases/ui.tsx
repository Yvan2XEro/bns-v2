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
import { useSheetPresentation } from "@/src/components/layout/sheetPresentation";
import { FormError } from "../checkout/FormError";
import { fillOf, inkOf } from "../checkout/fill";
import { type ShopPalette, useShopTheme } from "../shop/theme";

export type ButtonTone = "primary" | "outline" | "danger";

function toneColors(c: ShopPalette, tone: ButtonTone) {
	if (tone === "primary") {
		const fill = fillOf(c);
		return { bg: fill.bg, fg: fill.fg, border: fill.bg };
	}
	if (tone === "danger")
		return { bg: c.dangerSoft, fg: c.dangerText, border: c.dangerSoft };
	return { bg: c.card, fg: inkOf(c), border: c.border };
}

/** A 52pt button; `label` doubles as its accessibility label. */
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
			style={({ pressed }) => [
				styles.button,
				{
					backgroundColor: colors.bg,
					borderColor: colors.border,
					opacity: off ? 0.5 : pressed ? 0.85 : 1,
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
				<Text
					style={[styles.cardTitle, { color: c.text }]}
					accessibilityRole="header"
				>
					{title}
				</Text>
			) : null}
			{children}
		</View>
	);
}

export function FieldError({ message }: { message?: string | null }) {
	return <FormError message={message} />;
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
	const sheet = useSheetPresentation();
	return (
		<Modal
			visible={visible}
			transparent
			animationType={sheet.animationType}
			onRequestClose={onClose}
		>
			<Pressable
				style={[
					styles.backdrop,
					{
						backgroundColor: c.isDark
							? "rgba(0,0,0,0.6)"
							: "rgba(18, 22, 58,0.4)",
					},
				]}
				onPress={onClose}
				accessibilityRole="button"
				accessibilityLabel={closeLabel}
			/>
			<View
				style={[StyleSheet.absoluteFill, sheet.wrap]}
				pointerEvents="box-none"
			>
				<View
					style={[
						styles.sheet,
						{ backgroundColor: c.card, borderColor: c.border },
						sheet.panel,
					]}
				>
					<ScrollView
						contentContainerStyle={styles.sheetContent}
						keyboardShouldPersistTaps="handled"
					>
						<View style={[styles.grabber, { backgroundColor: c.border }]} />
						<Text
							style={[styles.sheetTitle, { color: c.text }]}
							accessibilityRole="header"
						>
							{title}
						</Text>
						{body ? (
							<Text style={[styles.body, { color: c.body }]}>{body}</Text>
						) : null}
						{children}
						<PurchaseButton
							label={closeLabel}
							tone="outline"
							onPress={onClose}
						/>
					</ScrollView>
				</View>
			</View>
		</Modal>
	);
}

export const purchaseText = StyleSheet.create({
	body: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 22 },
	muted: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 19 },
	strong: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	label: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
});

const styles = StyleSheet.create({
	button: {
		minHeight: 52,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	buttonText: {
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
		textAlign: "center",
	},
	card: { borderRadius: 16, padding: 16, gap: 12 },
	cardTitle: { fontSize: 18, lineHeight: 23, fontFamily: Fonts.displayBold },
	body: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 22 },
	backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
	sheet: {
		maxHeight: "85%",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
	},
	sheetContent: { padding: 20, paddingTop: 10, gap: 12, paddingBottom: 32 },
	grabber: {
		alignSelf: "center",
		width: 36,
		height: 4,
		borderRadius: 2,
		marginBottom: 6,
	},
	sheetTitle: { fontSize: 20, lineHeight: 25, fontFamily: Fonts.displayBold },
});
