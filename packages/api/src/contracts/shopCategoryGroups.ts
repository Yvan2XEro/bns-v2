export interface ShopCategoryCount {
	id: string;
	name: string;
	count: number;
}

export interface CategoryNode {
	name: string;
	parent: string | null;
}

/** Root-first ids from the top of the tree down to `id`. */
function pathTo(id: string, tree: Map<string, CategoryNode>): string[] {
	const path: string[] = [];
	for (let at: string | null = id; at && !path.includes(at); ) {
		path.unshift(at);
		at = tree.get(at)?.parent ?? null;
	}
	return path;
}

/**
 * The shop's counts grouped at the first level where its catalogue splits:
 * a phone shop lists Phones / Computers / Accessories, not one
 * "Electronics". Each group's id filters on that category, which the search
 * widens to its subcategories. Largest first; inactive categories drop out.
 */
export function groupedCounts(
	counts: Record<string, number>,
	tree: Map<string, CategoryNode>,
): ShopCategoryCount[] {
	const paths = Object.entries(counts)
		.filter(([id, count]) => count > 0 && tree.has(id))
		.map(([id, count]) => ({ path: pathTo(id, tree), count }));
	let shared = 0;
	while (
		paths.length > 0 &&
		paths.every(
			(p) =>
				p.path.length > shared + 1 && p.path[shared] === paths[0].path[shared],
		)
	) {
		shared++;
	}
	const groups = new Map<string, number>();
	for (const { path, count } of paths) {
		const id = path[Math.min(shared, path.length - 1)];
		groups.set(id, (groups.get(id) ?? 0) + count);
	}
	return [...groups]
		.map(([id, count]) => ({ id, name: tree.get(id)?.name ?? "", count }))
		.filter((group) => group.name)
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
