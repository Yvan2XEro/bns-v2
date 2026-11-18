"use client";

import { useEffect } from "react";
import { reportError } from "~/lib/monitoring";

/** Files the error an error boundary is showing, once per error. */
export function useReportError(error: unknown): void {
	useEffect(() => reportError(error), [error]);
}
