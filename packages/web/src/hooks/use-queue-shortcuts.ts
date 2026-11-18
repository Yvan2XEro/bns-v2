"use client";

import { useEffect } from "react";
import type { QueueSelection } from "~/lib/moderation-console";

export type QueueShortcut = "next" | "previous" | "close" | "takeNext" | "help";

/** The key a moderator pressed, as a console action; null for anything else. */
export function queueShortcut(
	event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">,
): QueueShortcut | null {
	if (event.altKey || event.ctrlKey || event.metaKey) return null;
	switch (event.key) {
		case "j":
		case "ArrowDown":
			return "next";
		case "k":
		case "ArrowUp":
			return "previous";
		case "Escape":
			return "close";
		case "n":
			return "takeNext";
		case "?":
			return "help";
		default:
			return null;
	}
}

/** The index to open after a move, staying inside the list. */
export function movedIndex(
	current: number,
	length: number,
	step: 1 | -1,
): number | null {
	if (length === 0) return null;
	if (current < 0) return step === 1 ? 0 : length - 1;
	return Math.min(length - 1, Math.max(0, current + step));
}

function typingIn(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable ||
		["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
	);
}

/**
 * j/k (or arrows) walk the queue and open each item, Esc closes the panel,
 * n takes the next item, ? shows the list of keys. Ignored while typing.
 */
export function useQueueShortcuts<T extends QueueSelection>({
	items,
	selection,
	select,
	onTakeNext,
	onHelp,
}: {
	items: T[];
	selection: QueueSelection | null;
	select: (item: T | null) => void;
	onTakeNext: () => void;
	onHelp: () => void;
}) {
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (typingIn(event.target)) return;
			const shortcut = queueShortcut(event);
			if (!shortcut) return;
			if (shortcut === "close") {
				if (selection) select(null);
				return;
			}
			event.preventDefault();
			if (shortcut === "takeNext") return onTakeNext();
			if (shortcut === "help") return onHelp();
			const current = selection
				? items.findIndex(
						(item) => item.type === selection.type && item.id === selection.id,
					)
				: -1;
			const index = movedIndex(
				current,
				items.length,
				shortcut === "next" ? 1 : -1,
			);
			const target = index === null ? undefined : items[index];
			if (target) select(target);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [items, selection, select, onTakeNext, onHelp]);
}
