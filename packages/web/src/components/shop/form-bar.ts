"use client";

import { useEffect, useRef } from "react";

/**
 * What a settings form tells the page header that holds its Cancel and Save
 * buttons: the buttons live outside the `<form>` and reach it through the
 * `form` attribute, so only the state has to travel up.
 */
export interface FormBarState {
	dirty: boolean;
	canSave: boolean;
	pending: boolean;
	reset: () => void;
}

export function useReportFormBar(
	onState: ((state: FormBarState) => void) | undefined,
	state: Omit<FormBarState, "reset">,
	reset: () => void,
) {
	const resetRef = useRef(reset);
	resetRef.current = reset;
	const { dirty, canSave, pending } = state;
	useEffect(() => {
		onState?.({ dirty, canSave, pending, reset: () => resetRef.current() });
	}, [onState, dirty, canSave, pending]);
}
