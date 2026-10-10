import { CheckCircle2, Circle } from "lucide-react";

export function StepHeader({ done, title }: { done: boolean; title: string }) {
	const Icon = done ? CheckCircle2 : Circle;
	return (
		<div className="flex items-center gap-2">
			<Icon
				aria-hidden="true"
				className={done ? "h-5 w-5 text-[#16A34A]" : "h-5 w-5 text-[#94A3B8]"}
			/>
			<h2 className="font-semibold text-[#0F172A]">{title}</h2>
		</div>
	);
}
