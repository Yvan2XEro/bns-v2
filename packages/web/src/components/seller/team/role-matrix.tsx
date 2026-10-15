"use client";

import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { MATRIX_ROLES, type MatrixCell, roleMatrix } from "~/lib/shop-roles";
import { cn } from "~/lib/utils";

const ROLE_KEYS = {
	owner: "roleOwner",
	manager: "roleManager",
	staff: "roleStaff",
} as const;

const CELL_STYLES: Record<MatrixCell, string> = {
	full: "bg-[#DCFCE7] text-[#166534]",
	limited: "bg-[#DBEAFE] text-[#1E40AF]",
	none: "bg-[#F1F5F9] text-[#94A3B8]",
};

function CellDot({ cell }: { cell: MatrixCell }) {
	return (
		<span
			className={cn(
				"inline-flex h-5 w-5 items-center justify-center rounded-full",
				CELL_STYLES[cell],
			)}
		>
			{cell === "full" ? (
				<Check aria-hidden="true" className="h-3 w-3" />
			) : (
				<Minus aria-hidden="true" className="h-3 w-3" />
			)}
		</span>
	);
}

/** What each role may do, straight from the role table the server also enforces. */
export function RoleMatrix() {
	const t = useTranslations("Team");

	return (
		<section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
			<div className="flex items-center justify-between px-4 py-3">
				<h2 className="font-bold text-[#0F172A]">{t("matrix.title")}</h2>
				<span className="text-[#64748B] text-xs">{t("matrix.fixed")}</span>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[520px] text-sm">
					<thead className="bg-[#F8FAFC] text-left text-[#64748B] text-xs uppercase">
						<tr>
							<th scope="col" className="px-4 py-2 font-semibold">
								{t("matrix.permission")}
							</th>
							{MATRIX_ROLES.map((role) => (
								<th
									key={role}
									scope="col"
									className="px-4 py-2 text-center font-semibold"
								>
									{t(ROLE_KEYS[role])}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{roleMatrix().map(({ area, cells }) => (
							<tr key={area} className="border-[#F1F5F9] border-t">
								<td className="px-4 py-2.5">
									<p className="font-semibold text-[#0F172A]">
										{t(`matrix.areas.${area}.name`)}
									</p>
									<p className="text-[#64748B] text-xs">
										{t(`matrix.areas.${area}.detail`)}
									</p>
								</td>
								{cells.map((cell, index) => (
									<td
										key={MATRIX_ROLES[index]}
										className="px-4 py-2.5 text-center"
									>
										<span className="sr-only">{t(`matrix.${cell}`)}</span>
										<CellDot cell={cell} />
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="flex flex-wrap items-center gap-4 border-[#F1F5F9] border-t px-4 py-3 text-[#64748B] text-xs">
				{(["full", "limited", "none"] as const).map((cell) => (
					<span key={cell} className="inline-flex items-center gap-1.5">
						<CellDot cell={cell} />
						{t(`matrix.${cell}`)}
					</span>
				))}
				<span className="ml-auto">{t("matrix.oneOwner")}</span>
			</div>
		</section>
	);
}
