"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "~/lib/utils";

/**
 * A panel on the right edge of the screen (full width on a phone), for a task
 * done over the page rather than in the middle of it. Its content starts at
 * the top and scrolls on its own; the header and the close button stay put.
 * Built on Radix's dialog: focus trap, Escape and outside click included.
 */
const Sheet = DialogPrimitive.Root;
const SheetClose = DialogPrimitive.Close;
const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;

const SheetContent = React.forwardRef<
	React.ComponentRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
		title: React.ReactNode;
		description?: React.ReactNode;
	}
>(({ className, children, title, description, ...props }, ref) => (
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/50" />
		<DialogPrimitive.Content
			ref={ref}
			className={cn(
				"sheet-panel fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col bg-background shadow-xl sm:max-w-md sm:border-line sm:border-l",
				className,
			)}
			{...props}
		>
			<div className="flex items-start justify-between gap-3 border-line border-b px-5 py-4">
				<div className="min-w-0 space-y-1">
					<DialogPrimitive.Title className="font-semibold text-ink text-lg leading-tight">
						{title}
					</DialogPrimitive.Title>
					{description ? (
						<DialogPrimitive.Description className="text-ink-muted text-sm">
							{description}
						</DialogPrimitive.Description>
					) : (
						<DialogPrimitive.Description className="sr-only">
							{title}
						</DialogPrimitive.Description>
					)}
				</div>
				<DialogPrimitive.Close className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
					<X aria-hidden="true" className="h-5 w-5" />
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle };
