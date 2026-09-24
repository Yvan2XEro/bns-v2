import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useHandleAvailability } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import { normalizeHandle, validateHandle } from "@/src/lib/shopHandle";
import { useShopTheme } from "./theme";

export type HandleStatus =
	| "idle"
	| "checking"
	| "available"
	| "invalid"
	| "reserved"
	| "taken";

export function HandleField({
	value,
	onChange,
	onStatus,
	current,
	disabled,
}: {
	value: string;
	onChange: (handle: string) => void;
	onStatus: (status: HandleStatus) => void;
	/** The shop's own handle, treated as "available" when editing. */
	current?: string;
	/** A read-only shop (suspended) or a caller the API would refuse anyway. */
	disabled?: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), 350);
		return () => clearTimeout(timer);
	}, [value]);

	const local = validateHandle(debounced);
	const remote = useHandleAvailability(
		debounced,
		local.ok && debounced !== current,
	);

	const status: HandleStatus = !debounced
		? "idle"
		: debounced === current
			? "available"
			: !local.ok
				? local.reason
				: remote.isFetching || debounced !== value
					? "checking"
					: remote.data
						? remote.data.available
							? "available"
							: (remote.data.reason ?? "taken")
						: "checking";

	useEffect(() => onStatus(status), [status, onStatus]);

	const color =
		status === "available"
			? c.success
			: status === "checking" || status === "idle"
				? c.muted
				: c.danger;

	return (
		<View style={{ gap: 6 }}>
			<View
				style={[
					styles.box,
					{ backgroundColor: c.input, borderColor: c.border },
				]}
			>
				<Text style={[styles.prefix, { color: c.muted }]}>
					buynsellem.com/s/
				</Text>
				<TextInput
					value={value}
					onChangeText={(v) => onChange(normalizeHandle(v))}
					editable={!disabled}
					autoCapitalize="none"
					autoCorrect={false}
					maxLength={30}
					accessibilityLabel={t("shop.handleLabel")}
					style={[styles.input, { color: c.text, opacity: disabled ? 0.5 : 1 }]}
				/>
				{status === "checking" ? (
					<ActivityIndicator size="small" color={c.muted} />
				) : status === "available" ? (
					<Ionicons name="checkmark-circle" size={18} color={c.success} />
				) : status !== "idle" ? (
					<Ionicons name="close-circle" size={18} color={c.danger} />
				) : null}
			</View>
			{status !== "idle" ? (
				<Text style={[styles.hint, { color }]}>
					{t(`shop.handle_${status}`)}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	box: {
		flexDirection: "row",
		alignItems: "center",
		height: 50,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 12,
		gap: 4,
	},
	prefix: { fontSize: 15, fontFamily: Fonts.body },
	input: { flex: 1, fontSize: 15, fontFamily: Fonts.bodySemibold },
	hint: { fontSize: 12, fontFamily: Fonts.body },
});
