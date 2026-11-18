import type { ReactNode } from "react";

/** One card of the product editor: a heading, an optional control, a body. */
export function EditorSection({
	title,
	aside,
	children,
}: {
	title: string;
	aside?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="rounded-xl border border-line bg-surface p-5">
			<div className="mb-4 flex items-center justify-between gap-3">
				<h2 className="font-bold text-ink">{title}</h2>
				{aside}
			</div>
			{children}
		</section>
	);
}
