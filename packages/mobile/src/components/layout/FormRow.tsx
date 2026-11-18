import { Children, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useResponsive } from "@/src/hooks/useResponsive";

/**
 * Short fields that belong together (a name and a phone, a minimum and a
 * maximum). In expanded they share a row, each taking an equal share; below
 * it they stay one per row, laid out by the form exactly as if this wrapper
 * were not there.
 */
export function FormRow({ children }: { children: ReactNode }) {
	const { isExpanded } = useResponsive();
	if (!isExpanded) return <>{children}</>;
	return (
		<View style={styles.row}>
			{Children.map(children, (child) =>
				child ? <View style={styles.cell}>{child}</View> : null,
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
	cell: { flex: 1, minWidth: 0 },
});
