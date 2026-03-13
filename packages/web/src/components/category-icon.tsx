import type { Category, Media } from "~/types";

interface CategoryIconProps {
	category: Category;
	size?: number;
	className?: string;
}

function getCategoryImage(category: Category): string | null {
	if (!category.image) return null;
	if (typeof category.image === "string") return null;
	return (category.image as Media).url ?? null;
}

export function CategoryIcon({
	category,
	size = 48,
	className,
}: CategoryIconProps) {
	const imageUrl = getCategoryImage(category);

	if (imageUrl) {
		return (
			<div
				className={`overflow-hidden rounded-full ${className ?? ""}`}
				style={{ width: size, height: size }}
			>
				{/* biome-ignore lint/performance/noImgElement: simple category thumbnail */}
				<img
					src={imageUrl}
					alt={category.name}
					width={size}
					height={size}
					className="h-full w-full object-cover"
				/>
			</div>
		);
	}

	if (category.icon) {
		return (
			<div
				className={`flex items-center justify-center rounded-full bg-[#EFF6FF] ${className ?? ""}`}
				style={{ width: size, height: size }}
			>
				<span
					style={{ fontSize: size * 0.5 }}
					role="img"
					aria-label={category.name}
				>
					{category.icon}
				</span>
			</div>
		);
	}

	return (
		<div
			className={`flex items-center justify-center rounded-full bg-[#EFF6FF] ${className ?? ""}`}
			style={{ width: size, height: size }}
		>
			<span
				style={{ fontSize: size * 0.5 }}
				role="img"
				aria-label={category.name}
			>
				📦
			</span>
		</div>
	);
}
