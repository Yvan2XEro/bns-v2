import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { findCachedListing } from "./cachedListing";

describe("findCachedListing", () => {
	test("finds a listing in a paged list or a favourite", () => {
		const client = new QueryClient();
		client.setQueryData(["listings", "recent"], {
			docs: [{ id: "a", title: "Vélo" }],
		});
		client.setQueryData(["favorites"], {
			pages: [{ docs: [{ id: "f1", listing: { id: "b", title: "Table" } }] }],
		});
		expect(findCachedListing(client, "a")).toMatchObject({ title: "Vélo" });
		expect(findCachedListing(client, "b")).toMatchObject({ title: "Table" });
		expect(findCachedListing(client, "zzz")).toBeUndefined();
	});
});
