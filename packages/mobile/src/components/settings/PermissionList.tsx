import { Ionicons } from "@expo/vector-icons";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { type ShopPalette, useShopTheme } from "@/src/components/shop/theme";
import { useAppPermissions } from "@/src/hooks/useAppPermissions";
import {
	APP_PERMISSIONS,
	type AppPermission,
	type PermissionState,
	permissionAction,
} from "@/src/lib/appPermissions";
import { useTranslation } from "@/src/lib/i18n";

const ICONS: Record<AppPermission, keyof typeof Ionicons.glyphMap> = {
	notifications: "notifications-outline",
	location: "location-outline",
	camera: "camera-outline",
	photos: "images-outline",
};

/** The pill's colours: allowed reads as a success, refused as a warning. */
function tone(state: PermissionState, c: ShopPalette) {
	switch (state) {
		case "granted":
			return { bg: c.successSoft, fg: c.successText };
		case "limited":
		case "denied":
		case "blocked":
			return { bg: c.warningSoft, fg: c.warningText };
		default:
			return { bg: c.neutralSoft, fg: c.neutralText };
	}
}

/**
 * Every device permission the app uses: what it is for, where it stands, and
 * the one thing to do about it — ask, or open the system settings, the only
 * place one can be withdrawn or restored once refused for good.
 */
export function PermissionList() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { states, act } = useAppPermissions();

	if (!states) return <ActivityIndicator color={c.primary} />;

	return (
		<View style={styles.list}>
			<Text style={[styles.intro, { color: c.muted }]}>
				{t("settings.permissions.intro")}
			</Text>
			{APP_PERMISSIONS.map((permission) => {
				const state = states[permission];
				const action = permissionAction(state);
				const colors = tone(state, c);
				const label = t(`settings.permissions.${permission}.label`);
				return (
					<View
						key={permission}
						style={[styles.row, { borderTopColor: c.border }]}
					>
						<Ionicons name={ICONS[permission]} size={20} color={c.text} />
						<View style={styles.text}>
							<Text style={[styles.label, { color: c.text }]}>{label}</Text>
							<Text style={[styles.why, { color: c.muted }]}>
								{t(`settings.permissions.${permission}.why`)}
							</Text>
							<View style={[styles.pill, { backgroundColor: colors.bg }]}>
								<Text style={[styles.pillText, { color: colors.fg }]}>
									{t(`settings.permissions.status.${state}`)}
								</Text>
							</View>
						</View>
						{action ? (
							<Pressable
								onPress={() => void act(permission)}
								accessibilityRole="button"
								accessibilityLabel={`${label}: ${t(
									`settings.permissions.action.${actionKey(state)}`,
								)}`}
								hitSlop={6}
								style={[
									styles.button,
									action === "request"
										? { backgroundColor: c.primary }
										: { borderColor: c.border, borderWidth: 1 },
								]}
							>
								<Text
									style={[
										styles.buttonText,
										{ color: action === "request" ? "#fff" : c.text },
									]}
								>
									{t(`settings.permissions.action.${actionKey(state)}`)}
								</Text>
							</Pressable>
						) : null}
					</View>
				);
			})}
		</View>
	);
}

/** "Allow" to ask, "Manage" for an allowed one, "Open settings" once blocked. */
function actionKey(
	state: PermissionState,
): "allow" | "manage" | "openSettings" {
	if (state === "undetermined" || state === "denied") return "allow";
	if (state === "blocked") return "openSettings";
	return "manage";
}

const styles = StyleSheet.create({
	list: { gap: 0 },
	intro: {
		fontSize: 13,
		fontFamily: Fonts.body,
		lineHeight: 18,
		marginBottom: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 12,
		paddingVertical: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	text: { flex: 1, gap: 4 },
	label: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	why: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
	pill: {
		alignSelf: "flex-start",
		borderRadius: 999,
		paddingHorizontal: 8,
		paddingVertical: 2,
		marginTop: 2,
	},
	pillText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	button: {
		minHeight: 36,
		paddingHorizontal: 14,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	buttonText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
