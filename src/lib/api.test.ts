import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchComplaints, fetchComplaintById, fetchTreeInventory, fetch311Calls } from "./api";
import { mockTrees } from "../data/mockTrees";

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to mock complaints when backend fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network Error"));

    const result = await fetchComplaints();

    expect(result.source).toBe("mock");
    expect(result.complaints).toEqual(mockTrees);
  });

  it("falls back to mock single complaint when backend fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Connection refused"));

    const result = await fetchComplaintById("TR-001");

    expect(result.source).toBe("mock");
    expect(result.complaint?.id).toBe("TR-001");
  });

  it("returns empty tree inventory on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

    const trees = await fetchTreeInventory();

    expect(trees).toEqual([]);
  });

  it("returns empty 311 calls on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

    const calls = await fetch311Calls();

    expect(calls).toEqual([]);
  });
});
