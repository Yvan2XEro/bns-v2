/**
 * The dialogs code awaits (react-call): `await Confirm.call({...})` instead of
 * an `open` state, an `onConfirm` and a dialog element at every call site.
 * Each one is mounted once, by `CallableRoots` in the root layout.
 */

/** Radix's dialog plays its 200 ms close animation before the call unmounts. */
export const CLOSE_ANIMATION_MS = 200;

/** Whether what was typed is the word asked for, case and outer spaces aside. */
export function typedMatches(typed: string, word: string): boolean {
	return typed.trim().toLocaleLowerCase() === word.trim().toLocaleLowerCase();
}
