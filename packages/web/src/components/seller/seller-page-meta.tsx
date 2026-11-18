"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

export interface PageMeta {
	/** What the page is about: an order number, a product's title… */
	reference: string;
	/** The section's list the reference belongs to, e.g. /seller/orders. */
	sectionHref?: string;
	/** Short facts kept in view while it scrolls ("Modified …", "Created …"). */
	details?: string[];
}

const PageMetaContext = createContext<{
	meta: PageMeta | null;
	setMeta: (meta: PageMeta | null) => void;
} | null>(null);

/** Holds what the current seller page says about itself, for the top bar. */
export function SellerPageMetaProvider({ children }: { children: ReactNode }) {
	const [meta, setMeta] = useState<PageMeta | null>(null);
	return (
		<PageMetaContext.Provider value={{ meta, setMeta }}>
			{children}
		</PageMetaContext.Provider>
	);
}

export function useSellerPageMeta(): PageMeta | null {
	return useContext(PageMetaContext)?.meta ?? null;
}

/**
 * Rendered by a detail page (through its breadcrumb): the top bar shows the
 * reference and the details while the page is open, and drops them when it
 * closes. Outside the seller shell it does nothing.
 */
export function SellerPageMeta({ reference, sectionHref, details }: PageMeta) {
	const setMeta = useContext(PageMetaContext)?.setMeta;
	const key = JSON.stringify([reference, sectionHref, details ?? []]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for reference and details
	useEffect(() => {
		if (!setMeta) return;
		setMeta({ reference, sectionHref, details });
		return () => setMeta(null);
	}, [key, setMeta]);
	return null;
}
