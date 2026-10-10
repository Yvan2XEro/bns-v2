"use client";

import type { ReactNode } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";

export interface DialogControl {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** The frame every buyer action dialog shares; the form inside is its own. */
export function ActionDialog({
	open,
	onOpenChange,
	title,
	description,
	children,
}: DialogControl & {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				{children}
			</DialogContent>
		</Dialog>
	);
}
