const CONVERSATION_ACTIONS = new Set(["message", "upload_evidence"]);
const RESPONSE_ACTIONS = new Set([
	"submit",
	"respond_accept",
	"respond_propose",
	"respond_contest",
	"proposal_accept",
	"proposal_reject",
	"escalate",
	"withdraw",
]);

export function disputeActionGroups(actions: readonly string[]) {
	return actions.reduce(
		(groups, action) => {
			if (CONVERSATION_ACTIONS.has(action)) groups.conversation.push(action);
			if (RESPONSE_ACTIONS.has(action)) groups.response.push(action);
			return groups;
		},
		{ conversation: [] as string[], response: [] as string[] },
	);
}
