import { Ionicons } from "@expo/vector-icons";
import {
	Platform,
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { BottomSheet } from "@/src/components/location/BottomSheet";
import { useTranslation } from "@/src/lib/i18n";
import {
	SHOP_SORT_LABEL_KEYS,
	SHOP_SORTS,
	type ShopSort,
} from "@/src/lib/shopStorefront";
import { useShopBrand } from "./brand";
import { useShopTheme } from "./theme";

const ROW_HEIGHT = 56;
const SHEET_CHROME = 96;

export function ShopSortSheet({
	visible,
	value,
	onChange,
	onClose,
}: {
	visible: boolean;
	value: ShopSort;
	onChange: (sort: ShopSort) => void;
	onClose: () => void;
}) {
	const c = useShopTheme();
	const brand = useShopBrand();
	const { t } = useTranslation();
	const { height } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const wanted = SHEET_CHROME + ROW_HEIGHT * SHOP_SORTS.length + insets.bottom;

	return (
		<BottomSheet
			visible={visible}
			title={t("shop.sortTitle")}
			onClose={onClose}
			heightRatio={Math.min(0.7, wanted / height)}
		>
			<View accessibilityRole="radiogroup" style={styles.list}>
				{SHOP_SORTS.map((sort, index) => {
					const selected = sort === value;
					const last = index === SHOP_SORTS.length - 1;
					return (
						<Pressable
							key={sort}
							onPress={() => onChange(sort)}
							accessibilityRole="radio"
							accessibilityState={{ checked: selected }}
							android_ripple={{ color: c.border }}
							style={({ pressed }) => [
								styles.row,
								{
									borderBottomColor: c.border,
									borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
								},
								pressed && Platform.OS === "ios" && styles.pressed,
							]}
						>
							<Text
								style={[
									styles.label,
									{ color: selected ? brand.accentText : c.text },
									selected && styles.selected,
								]}
							>
								{t(SHOP_SORT_LABEL_KEYS[sort])}
							</Text>
							{selected ? (
								<Ionicons name="checkmark" size={20} color={brand.accentText} />
							) : null}
						</Pressable>
					);
				})}
			</View>
		</BottomSheet>
	);
}

const styles = StyleSheet.create({
	list: { paddingHorizontal: 20 },
	row: {
		height: ROW_HEIGHT,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	pressed: { opacity: 0.6 },
	label: { fontSize: 16, fontFamily: Fonts.body },
	selected: { fontFamily: Fonts.bodySemibold },
});
