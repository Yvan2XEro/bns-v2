/**
 * What opening an item of a list does, decided without React or the router
 * so it can be tested on its own. `useSplitSelection` carries it out.
 */

/** The search param a split list keeps its selected item in. */
export const SPLIT_PARAM = "selected";

export type OpenAction<Href> =
	/** Not split: the item's own screen, as on a phone. */
	| { kind: "push"; href: Href }
	/** Split: select in place; the item's own params are dropped. */
	| { kind: "select"; params: Record<string, string | undefined> };

export function openAction<Href>(
	isSplit: boolean,
	id: string,
	detailHref: (id: string) => Href,
	itemParams: readonly string[] = [],
): OpenAction<Href> {
	if (!isSplit) return { kind: "push", href: detailHref(id) };
	return {
		kind: "select",
		params: {
			...Object.fromEntries(itemParams.map((name) => [name, undefined])),
			[SPLIT_PARAM]: id,
		},
	};
}

/**
 * A selection left in the URL when the window stops being split (rotated to
 * portrait, narrowed): the item must still be on screen, as its own screen.
 */
export function selectionToPush(
	isSplit: boolean,
	selectedId: string | null,
): string | null {
	return !isSplit && selectedId ? selectedId : null;
}
