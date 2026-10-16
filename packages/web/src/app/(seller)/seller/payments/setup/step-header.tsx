import { CheckCircle2, Circle } from "lucide-react";

export function StepHeader({ done, title }: { done: boolean; title: string }) {
	const Icon = done ? CheckCircle2 : Circle;
	return (
		<div className="flex items-center gap-2">
			<Icon
				aria-hidden="true"
				className={done ? "h-5 w-5 text-ok" : "h-5 w-5 text-ink-faint"}
			/>
			<h2 className="font-semibold text-ink">{title}</h2>
		</div>
	);
}
