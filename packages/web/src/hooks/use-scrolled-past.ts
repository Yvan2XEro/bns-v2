"use client";

import { useEffect, useState } from "react";

/**
 * True once the element matching `selector` has scrolled up under the sticky
 * header (`offset` px from the top), false while it is still visible or
 * below. Off when `enabled` is false or the element is not on the page.
 */
export function useScrolledPast(
	selector: string,
	enabled: boolean,
	offset = 64,
): boolean {
	const [past, setPast] = useState(false);
	useEffect(() => {
		if (!enabled) {
			setPast(false);
			return;
		}
		const target = document.querySelector(selector);
		if (!target || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			([entry]) =>
				setPast(!entry.isIntersecting && entry.boundingClientRect.top < offset),
			{ rootMargin: `-${offset}px 0px 0px 0px` },
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [selector, enabled, offset]);
	return past;
}
