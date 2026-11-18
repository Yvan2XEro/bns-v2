import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

/** A category as the menus draw it: name, picture, where it sits. */
export interface TreeCategory {
	id: string;
	name: string;
	parent: string | null;
	imageUrl: string | null;
}

export interface CategoryGroup extends TreeCategory {
	children: TreeCategory[];
}

export interface CategoryRubric extends TreeCategory {
	children: CategoryGroup[];
}

type RawCategory = {
	id?: unknown;
	name?: unknown;
	parent?: unknown;
	image?: unknown;
};

function parentId(parent: unknown): string | null {
	if (typeof parent === "string") return parent;
	if (parent && typeof parent === "object" && "id" in parent)
		return String((parent as { id: unknown }).id);
	return null;
}

/**
 * The public categories, flat, as three levels: rubrics in API order, each
 * with its sub-categories and theirs. A category whose parent is missing
 * (inactive, deleted) becomes a rubric rather than disappearing.
 */
export function categoryTree(raw: RawCategory[]): CategoryRubric[] {
	const all: TreeCategory[] = raw
		.filter((c) => c?.id && typeof c.name === "string" && c.name)
		.map((c) => ({
			id: String(c.id),
			name: c.name as string,
			parent: parentId(c.parent),
			imageUrl: resolveListingImageUrl(c.image, "thumbnail"),
		}));
	const ids = new Set(all.map((c) => c.id));
	const childrenOf = (id: string) => all.filter((c) => c.parent === id);
	return all
		.filter((c) => !c.parent || !ids.has(c.parent))
		.map((rubric) => ({
			...rubric,
			children: childrenOf(rubric.id).map((group) => ({
				...group,
				children: childrenOf(group.id),
			})),
		}));
}
