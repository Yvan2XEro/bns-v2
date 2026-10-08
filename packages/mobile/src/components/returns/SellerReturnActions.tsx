import { Pressable, Text, View } from "react-native";
import { useReturnAction } from "@/src/hooks/useReturns";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { SELLER_RETURN_ACTIONS } from "../../../../api/src/contracts/returnInputs";
import type { ReturnCaseView } from "../../../../api/src/contracts/returns";
import { useShopTheme } from "../shop/theme";
import { ReturnInspectionForm } from "./ReturnInspectionForm";
import { ReturnRefundProofForm } from "./ReturnRefundProofForm";

export function SellerReturnActions({ view }: { view: ReturnCaseView }) {
	const { t } = useTranslation();
	const c = useShopTheme();
	const mutation = useReturnAction(view.id);
	if (
		!SELLER_RETURN_ACTIONS.some((action) =>
			view.allowedActions.includes(action),
		)
	)
		return null;
	return (
		<View
			style={{
				padding: 16,
				gap: 16,
				borderRadius: 14,
				borderColor: c.border,
				borderWidth: 1,
				backgroundColor: c.card,
			}}
		>
			{(["pickup", "receive"] as const)
				.filter((action) => view.allowedActions.includes(action))
				.map((action) => (
					<Pressable
						key={action}
						accessibilityRole="button"
						accessibilityLabel={t(`returns.action.${action}`)}
						disabled={mutation.isPending}
						onPress={() => mutation.mutate({ action })}
						style={{
							minHeight: 44,
							alignItems: "center",
							justifyContent: "center",
							backgroundColor: c.primary,
							borderRadius: 10,
						}}
					>
						<Text style={{ color: "#fff" }}>
							{t(`returns.action.${action}`)}
						</Text>
					</Pressable>
				))}
			{mutation.isError ? (
				<Text accessibilityRole="alert" style={{ color: "#dc2626" }}>
					{resolveErrorMessage(mutation.error, t)}
				</Text>
			) : null}
			{view.allowedActions.includes("inspect") ? (
				<ReturnInspectionForm view={view} />
			) : null}
			{view.allowedActions.includes("refund_proof") ? (
				<ReturnRefundProofForm view={view} />
			) : null}
		</View>
	);
}
