import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { MATRIX_ROLES, type MatrixCell, roleMatrix } from "@/src/lib/shopRoles";

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
	note: { fontSize: 12, fontFamily: Fonts.body, lineHeight: 17, marginTop: 8 },
});
