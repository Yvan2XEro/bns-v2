"use client";

import { useEffect } from "react";

const PREFIX = /^\(\d+\+?\) /;

/** `(3) Orders`: the tab says how much is waiting even when it is in the background. */
export function withTitleCount(title: string, count: number): string {
	const bare = title.replace(PREFIX, "");
	if (count <= 0) return bare;
	return `(${count > 99 ? "99+" : count}) ${bare}`;
}

/**
 * Keeps the count in front of the page title. Next rewrites `<title>` on every
 * navigation, so the prefix is put back each time the element changes.
 */
export function useTitleCount(count: number) {
	useEffect(() => {
		const apply = () => {
			const next = withTitleCount(document.title, count);
			if (next !== document.title) document.title = next;
		};
		apply();
		const observer = new MutationObserver(apply);
		observer.observe(document.head, {
			subtree: true,
			childList: true,
			characterData: true,
		});
		return () => {
			observer.disconnect();
			document.title = withTitleCount(document.title, 0);
		};
	}, [count]);
}
