import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useAppPermissions } from "@/src/hooks/useAppPermissions";
import {
	APP_PERMISSIONS,
	type AppPermission,
	type PermissionState,
	permissionAction,
} from "@/src/lib/appPermissions";
import { useTranslation } from "@/src/lib/i18n";
import { GroupedSection, RowIcon, useGroupedColors } from "./Grouped";

const ICONS: Record<AppPermission, keyof typeof Ionicons.glyphMap> = {
	notifications: "notifications-outline",
	location: "location-outline",
	camera: "camera-outline",
	photos: "images-outline",
};

type Palette = ReturnType<typeof useGroupedColors>;

/** The state's colours: allowed reads as a success, refused as a warning. */
function tone(state: PermissionState, c: Palette) {
	switch (state) {
		case "granted":
			return { fg: c.successText, icon: "checkmark-circle" as const };
		case "limited":
		case "denied":
		case "blocked":
			return { fg: c.warningText, icon: "alert-circle" as const };
		default:
			return { fg: c.mutedForeground, icon: "ellipse-outline" as const };
	}
}

/**
 * Every device permission the app uses, as a grouped list: what it is for,
 * where it stands, and the one thing to do about it — ask, or open the
 * system settings, the only place one can be withdrawn or restored once
 * refused for good.
 */
export function PermissionList({ title }: { title: string }) {
	const c = useGroupedColors();
	const { t } = useTranslation();
	const { states, act } = useAppPermissions();

	return (
		<GroupedSection
			title={title}
			footer={t("settings.permissions.intro")}
			inset={58}
		>
			{APP_PERMISSIONS.map((permission) => {
				const label = t(`settings.permissions.${permission}.label`);
				if (!states) {
					return (
						<View key={permission} style={styles.row}>
							<RowIcon name={ICONS[permission]} />
							<View style={styles.text}>
								<Text style={[styles.label, { color: c.foreground }]}>
									{label}
								</Text>
								<View style={[styles.skeleton, { backgroundColor: c.well }]} />
							</View>
						</View>
					);
				}
				const state = states[permission];
				const action = permissionAction(state);
				const colors = tone(state, c);
				const status = t(`settings.permissions.status.${state}`);
				const actionLabel = t(
					`settings.permissions.action.${actionKey(state)}`,
				);
				return (
					<View key={permission} style={styles.row}>
						<RowIcon name={ICONS[permission]} />
						<View
							style={styles.text}
							accessible
							accessibilityLabel={`${label}, ${status}. ${t(
								`settings.permissions.${permission}.why`,
							)}`}
						>
							<Text style={[styles.label, { color: c.foreground }]}>
								{label}
							</Text>
							<Text style={[styles.why, { color: c.mutedForeground }]}>
								{t(`settings.permissions.${permission}.why`)}
							</Text>
							<View style={styles.status}>
								<Ionicons name={colors.icon} size={14} color={colors.fg} />
								<Text style={[styles.statusText, { color: colors.fg }]}>
									{status}
								</Text>
							</View>
						</View>
						{action ? (
							<Pressable
								onPress={() => void act(permission)}
								accessibilityRole="button"
								accessibilityLabel={`${label}: ${actionLabel}`}
								hitSlop={8}
								style={({ pressed }) => [
									styles.button,
									action === "request"
										? { backgroundColor: c.primaryFill }
										: {
												borderColor: c.borderStrong,
												borderWidth: StyleSheet.hairlineWidth * 2,
											},
									pressed ? { opacity: 0.8 } : null,
								]}
							>
								<Text
									style={[
										styles.buttonText,
										{
											color: action === "request" ? "#ffffff" : c.link,
										},
									]}
								>
									{actionLabel}
								</Text>
							</Pressable>
						) : null}
					</View>
				);
			})}
		</GroupedSection>
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
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 12,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	text: { flex: 1, gap: 3 },
	label: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.bodyMedium },
	why: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
	status: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		marginTop: 3,
	},
	statusText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	skeleton: { height: 12, width: "60%", borderRadius: 6, marginTop: 6 },
	button: {
		minHeight: 36,
		minWidth: 72,
		paddingHorizontal: 14,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		alignSelf: "center",
	},
	buttonText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
