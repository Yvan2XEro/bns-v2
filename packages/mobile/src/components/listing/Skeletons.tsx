import {
	type DimensionValue,
	type StyleProp,
	StyleSheet,
	useWindowDimensions,
	View,
	type ViewStyle,
} from "react-native";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { SkeletonBlock } from "@/src/components/SkeletonCard";

/**
 * A placeholder block. A thin alias over the app's one skeleton primitive,
 * which breathes while content loads and holds still under Reduce Motion.
 */
export function SkeletonBox({
	width,
	height,
	radius = 8,
	style,
}: {
	width: DimensionValue;
	height: number;
	radius?: number;
	style?: StyleProp<ViewStyle>;
}) {
	return (
		<SkeletonBlock
			width={width}
			height={height}
			borderRadius={radius}
			style={style}
		/>
	);
}

function useGround() {
	const isDark = useColorScheme() === "dark";
	return isDark ? Colors.dark : Colors.light;
}

/** The listing page while it loads: photo, price tag, title, seller. */
export function ListingDetailSkeleton({
	galleryHeight,
}: {
	galleryHeight: number;
}) {
	const c = useGround();
	return (
		<View
			style={[styles.root, { backgroundColor: c.background }]}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<SkeletonBox width="100%" height={galleryHeight} radius={0} />
			<View style={styles.detailBody}>
				<SkeletonBox width={150} height={44} radius={10} />
				<SkeletonBox width="88%" height={24} />
				<SkeletonBox width="60%" height={24} />
				<SkeletonBox width="45%" height={14} style={styles.gapTop} />
				<View
					style={[
						styles.card,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<SkeletonBox width={56} height={56} radius={28} />
					<View style={styles.cardLines}>
						<SkeletonBox width="55%" height={16} />
						<SkeletonBox width="35%" height={12} />
					</View>
				</View>
				<View
					style={[
						styles.cardColumn,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<SkeletonBox width="40%" height={18} />
					<SkeletonBox width="100%" height={13} />
					<SkeletonBox width="94%" height={13} />
					<SkeletonBox width="70%" height={13} />
				</View>
			</View>
		</View>
	);
}

/** A public profile while it loads: the identity card and two rows. */
export function ProfileSkeleton() {
	const c = useGround();
	const { width } = useWindowDimensions();
	const cardW = (Math.min(width, 640) - 44) / 2;
	return (
		<View
			style={styles.profile}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<View
				style={[
					styles.profileCard,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<SkeletonBox width={88} height={88} radius={44} />
				<SkeletonBox width="50%" height={22} />
				<SkeletonBox width="35%" height={14} />
				<SkeletonBox width="100%" height={52} radius={12} />
			</View>
			<ListingGridSkeleton cardWidth={cardW} rows={1} />
		</View>
	);
}

/** Rows of photo-led cards, two (or more) across. */
export function ListingGridSkeleton({
	cardWidth,
	columns = 2,
	rows = 2,
	gap = 12,
}: {
	cardWidth: number;
	columns?: number;
	rows?: number;
	gap?: number;
}) {
	return (
		<View
			style={{ gap: 16 }}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			{Array.from({ length: rows }, (_, r) => (
				<View key={r} style={[styles.gridRow, { gap }]}>
					{Array.from({ length: columns }, (_, i) => (
						<GridCardSkeleton key={i} cardWidth={cardWidth} />
					))}
				</View>
			))}
		</View>
	);
}

/** One ListingCard while it loads: the white card, a 4:3 photo, two lines. */
function GridCardSkeleton({ cardWidth }: { cardWidth: number }) {
	const c = Colors[useColorScheme() === "dark" ? "dark" : "light"];
	return (
		<View
			style={[
				styles.gridCard,
				{ width: cardWidth, backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<SkeletonBox
				width={cardWidth}
				height={Math.round(cardWidth * 0.75)}
				radius={0}
			/>
			<View style={styles.gridCardWords}>
				<SkeletonBox width="80%" height={14} />
				<SkeletonBox width="45%" height={12} />
			</View>
		</View>
	);
}

/** A shop storefront while it loads: banner, identity, contact, grid. */
export function ShopSkeleton({
	cardWidth,
	columns,
	gap,
}: {
	cardWidth: number;
	columns: number;
	gap: number;
}) {
	const c = useGround();
	return (
		<View
			style={[styles.root, { backgroundColor: c.background }]}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<SkeletonBox width="100%" height={180} radius={0} />
			<View style={styles.shopBody}>
				<SkeletonBox width={72} height={72} radius={16} />
				<SkeletonBox width="60%" height={26} />
				<SkeletonBox width="40%" height={14} />
				<SkeletonBox width="100%" height={52} radius={12} />
				<View style={styles.gapTop}>
					<ListingGridSkeleton
						cardWidth={cardWidth}
						columns={columns}
						gap={gap}
						rows={1}
					/>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	gridCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
	gridCardWords: {
		gap: 8,
		paddingTop: 10,
		paddingHorizontal: 10,
		paddingBottom: 12,
	},
	root: { flex: 1 },
	detailBody: { padding: 16, gap: 10 },
	gapTop: { marginTop: 8 },
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		marginTop: 12,
	},
	cardLines: { flex: 1, gap: 8 },
	cardColumn: {
		gap: 10,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
	},
	profile: { padding: 16, gap: 16 },
	profileCard: {
		alignItems: "center",
		gap: 12,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 20,
	},
	gridRow: { flexDirection: "row" },
	shopBody: { padding: 16, gap: 12 },
});
