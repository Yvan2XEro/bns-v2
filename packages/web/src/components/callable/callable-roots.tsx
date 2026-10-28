"use client";

import { ShareDialog } from "~/components/share/share-dialog";
import { Confirm } from "./confirm";
import { Notice } from "./notice";

/** Where the awaited dialogs render; mounted once in the root layout. */
export function CallableRoots() {
	return (
		<>
			<Confirm />
			<Notice />
			<ShareDialog />
		</>
	);
}
