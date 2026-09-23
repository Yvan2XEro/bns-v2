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
		<section className="rounded-xl border border-[#E2E8F0] bg-white p-5">
			<div className="mb-4 flex items-center justify-between gap-3">
				<h2 className="font-bold text-[#0F172A]">{title}</h2>
				{aside}
			</div>
			{children}
		</section>
	);
}
