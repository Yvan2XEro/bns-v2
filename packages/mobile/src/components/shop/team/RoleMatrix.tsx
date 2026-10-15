import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { MATRIX_ROLES, type MatrixCell, roleMatrix } from "@/src/lib/shopRoles";
import type { ShopRole } from "@/src/types/api";

const ROLE_LABEL_KEYS = {
	owner: "team.roleOwner",
	manager: "team.roleManager",
	staff: "team.roleStaff",
} as const;

/** What each role may do, straight from the role table the server also enforces. */
export function RoleMatrix() {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.muted }]}>
				{t("team.matrixTitle")}
			</Text>
			<View style={styles.row}>
				<View style={styles.areaCol} />
				{MATRIX_ROLES.map((role) => (
					<Text
						key={role}
						style={[styles.head, { color: c.muted }]}
						numberOfLines={1}
					>
						{t(ROLE_LABEL_KEYS[role])}
					</Text>
				))}
			</View>
			{roleMatrix().map((row) => (
				<View
					key={row.area}
					style={[styles.row, styles.line, { borderTopColor: c.border }]}
				>
					<Text style={[styles.area, { color: c.text }]}>
						{t(`team.matrixArea.${row.area}`)}
					</Text>
					{row.cells.map((cell, index) => (
						<View key={MATRIX_ROLES[index]} style={styles.cellCol}>
							<Cell cell={cell} />
						</View>
					))}
				</View>
			))}
			<Text style={[styles.note, { color: c.muted }]}>
				{t("team.matrixNote")}
			</Text>
		</View>
	);
}

/** A role to pick, with what it may do spelled out once it is selected. */
export function RoleCard({
	role,
	selected,
	onPress,
}: {
	role: ShopRole;
	selected: boolean;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const column = MATRIX_ROLES.indexOf(role);

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="radio"
			accessibilityState={{ checked: selected }}
			accessibilityLabel={t(ROLE_LABEL_KEYS[role])}
			style={[
				styles.roleCard,
				{
					borderColor: selected ? c.primary : c.border,
					borderWidth: selected ? 2 : 1,
					backgroundColor: selected ? c.primarySoft : c.card,
				},
			]}
		>
			<View style={styles.roleHead}>
				<Ionicons
					name={selected ? "radio-button-on" : "radio-button-off"}
					size={22}
					color={selected ? c.primary : c.muted}
				/>
				<View style={{ flex: 1 }}>
					<Text
						style={[styles.roleName, { color: selected ? c.primary : c.text }]}
					>
						{t(ROLE_LABEL_KEYS[role])}
					</Text>
					<Text style={[styles.note, { color: c.muted, marginTop: 0 }]}>
						{t(`team.roleDesc.${role}`)}
					</Text>
				</View>
			</View>
			{selected ? (
				<View style={[styles.rights, { borderTopColor: c.border }]}>
					{roleMatrix().map((row) => (
						<View key={row.area} style={styles.right}>
							<Cell cell={row.cells[column] ?? "none"} />
							<Text style={[styles.area, { color: c.body }]}>
								{t(`team.matrixArea.${row.area}`)}
							</Text>
						</View>
					))}
				</View>
			) : null}
		</Pressable>
	);
}

function Cell({ cell }: { cell: MatrixCell }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const look = {
		full: { icon: "checkmark" as const, bg: c.successSoft, fg: c.success },
		view: {
			icon: "eye-outline" as const,
			bg: c.warningSoft,
			fg: c.warningText,
		},
		none: { icon: "remove" as const, bg: c.neutralSoft, fg: c.muted },
	}[cell];
	return (
		<View
			style={[styles.dot, { backgroundColor: look.bg }]}
			accessibilityLabel={
				cell === "view" ? t("team.matrixViewOnly") : undefined
			}
		>
			<Ionicons name={look.icon} size={12} color={look.fg} />
		</View>
	);
}

const styles = StyleSheet.create({
	card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 2 },
	title: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		letterSpacing: 0.6,
		textTransform: "uppercase",
		marginBottom: 6,
	},
	row: { flexDirection: "row", alignItems: "center", minHeight: 30 },
	line: { borderTopWidth: StyleSheet.hairlineWidth },
	areaCol: { flex: 1.4 },
	area: { flex: 1.4, fontSize: 13, fontFamily: Fonts.body },
	head: {
		flex: 1,
		textAlign: "center",
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
	},
	cellCol: { flex: 1, alignItems: "center" },
	dot: {
		width: 20,
		height: 20,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	roleCard: { borderRadius: 16, padding: 14, gap: 10 },
	roleHead: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
	roleName: { fontSize: 15, fontFamily: Fonts.displayBold },
	rights: {
		flexDirection: "row",
		flexWrap: "wrap",
		rowGap: 8,
		paddingTop: 10,
		marginLeft: 34,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	right: { width: "50%", flexDirection: "row", alignItems: "center", gap: 6 },
	note: { fontSize: 12, fontFamily: Fonts.body, lineHeight: 17, marginTop: 8 },
});
