import { type Href, Redirect } from "expo-router";
import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
	EmptyState,
	type EmptyStateIllustration,
} from "@/src/components/EmptyState";
import { useShopTheme } from "@/src/components/shop/theme";
import { useIsSplit, useSplitSelection } from "@/src/hooks/useSplitSelection";
import { SplitLayout } from "./SplitLayout";

export interface SplitListProps {
	/** The item open beside the list, to show as selected; null on a phone. */
	selectedId: string | null;
	/** Opens an item: beside the list when split, as its own screen otherwise. */
	onOpen: (id: string) => void;
}

/**
 * The one way a list screen opens its items. On a phone and a tablet in
 * portrait it is the list alone and an item opens as its own screen; on a
 * tablet in landscape the list stays on the left and the item shows on the
 * right, like the Play Store. Every list/detail pair goes through here —
 * no screen lays out its own split.
 */
export function SplitScreen({
	detailHref,
	renderList,
	renderDetail,
	empty,
	itemParams,
}: {
	/** The item's own screen, for a phone and for deep links. */
	detailHref: (id: string) => Href;
	renderList: (props: SplitListProps) => ReactNode;
	renderDetail: (id: string) => ReactNode;
	/** What the detail pane says before anything is selected. */
	empty: { illustration: EmptyStateIllustration; title: string };
	/** Search params that belong to the selected item only (a draft). */
	itemParams?: readonly string[];
}) {
	const { isSplit, selectedId, open, close } = useSplitSelection(
		detailHref,
		itemParams,
	);
	const list = renderList({ selectedId, onOpen: open });
	if (!isSplit) return list;
	return (
		<SplitLayout
			list={list}
			detailKey={selectedId ?? ""}
			onCloseDetail={close}
			detail={
				selectedId ? renderDetail(selectedId) : <SplitEmptyDetail {...empty} />
			}
		/>
	);
}

function SplitEmptyDetail({
	illustration,
	title,
}: {
	illustration: EmptyStateIllustration;
	title: string;
}) {
	const c = useShopTheme();
	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<EmptyState illustration={illustration} title={title} size={180} />
		</SafeAreaView>
	);
}

/**
 * An item's own screen. When the window has room for the split (a rotation,
 * a deep link or a notification on a tablet), it hands over to its list with
 * the item selected instead of covering the list.
 */
export function SplitDetailRoute({
	listHref,
	children,
}: {
	/** The list with this item selected: `/…?${SPLIT_PARAM}=${id}`. */
	listHref: Href;
	children: ReactNode;
}) {
	if (useIsSplit()) return <Redirect href={listHref} />;
	return children;
}
