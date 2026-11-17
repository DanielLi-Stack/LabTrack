import { describe, expect, it } from "vitest";
import { canBorrow } from "../src/lib/format";

const base = { condition: "NORMAL", isBorrowable: true, inactiveAt: null, loans: [], handovers: [] };
describe("equipment availability", () => {
  it("requires a healthy idle device", () => {
    expect(canBorrow(base)).toBe(true);
    expect(canBorrow({ ...base, condition: "DAMAGED" })).toBe(false);
    expect(canBorrow({ ...base, inactiveAt: new Date() })).toBe(false);
    expect(canBorrow({ ...base, loans: [{ status: "ACTIVE" }] })).toBe(false);
    expect(canBorrow({ ...base, loans: [{ status: "RETURN_PENDING" }] })).toBe(false);
    expect(canBorrow({ ...base, handovers: [{ status: "RELEASED" }] })).toBe(false);
    expect(canBorrow({ ...base, handovers: [{ status: "DISPUTED" }] })).toBe(false);
  });
  it("does not reserve a device for uncollected approvals", () => {
    expect(canBorrow({ ...base, loans: [{ status: "REQUESTED" }] })).toBe(true);
    expect(canBorrow({ ...base, loans: [{ status: "APPROVED" }] })).toBe(true);
  });
});
