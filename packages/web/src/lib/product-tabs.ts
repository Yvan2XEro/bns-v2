/**
 * The product editor's tabs. Each is a path under the product
 * (`/seller/catalogue/:id`, `…/variants`, `…/stock`) so it can be linked to,
 * reloaded and reached with the back button; the editor itself lives in the
 * segment's layout, so moving between tabs keeps unsaved edits.
 */
export const PRODUCT_TABS = ["details", "variants", "stock"] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

/** The tab a child segment of `/seller/catalogue/:id` names; none: details. */
export function productTabOf(segment: string | null): ProductTab {
	return segment === "variants" || segment === "stock" ? segment : "details";
}

export function productTabHref(productId: string, tab: ProductTab): string {
	const base = `/seller/catalogue/${productId}`;
	return tab === "details" ? base : `${base}/${tab}`;
}

/** The tab showing the field a form issue sits on. */
export function tabOfIssue(path: string): Exclude<ProductTab, "stock"> {
	return path === "options" ||
		path.startsWith("options.") ||
		path === "variants" ||
		path.startsWith("variants.")
		? "variants"
		: "details";
}

/** How many issues each form tab holds, for its badge. */
export function issuesPerTab(
	paths: string[],
): Record<Exclude<ProductTab, "stock">, number> {
	const counts = { details: 0, variants: 0 };
	for (const path of paths) counts[tabOfIssue(path)]++;
	return counts;
}

/**
 * Where a refused save sends the seller: the tab they are on if it holds an
 * issue, else the first tab that does.
 */
export function tabForIssues(current: ProductTab, paths: string[]): ProductTab {
	const counts = issuesPerTab(paths);
	if (current !== "stock" && counts[current] > 0) return current;
	if (counts.details > 0) return "details";
	if (counts.variants > 0) return "variants";
	return current;
}

/** The field paths react-hook-form holds an error on (the form's root aside). */
export function errorPaths(errors: unknown, prefix = ""): string[] {
	if (typeof errors !== "object" || errors === null) return [];
	const paths: string[] = [];
	const node = errors as Record<string, unknown>;
	if (prefix && typeof node.message === "string") paths.push(prefix);
	for (const [key, value] of Object.entries(node)) {
		if (key === "ref" || key === "message" || key === "type" || key === "types")
			continue;
		if (!prefix && key === "root") continue;
		paths.push(...errorPaths(value, prefix ? `${prefix}.${key}` : key));
	}
	return paths;
}
