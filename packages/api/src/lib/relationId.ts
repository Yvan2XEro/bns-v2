export function relationId(value: unknown): string | null {
	if (typeof value === "string" && value) return value;
	if (typeof value === "number") return String(value);
	if (value && typeof value === "object" && "id" in value) {
		const { id } = value as { id?: unknown };
		if (typeof id === "string" && id) return id;
		if (typeof id === "number") return String(id);
	}
	return null;
}
