import { describe, expect, it } from "vitest";

import { availabilityMessage, validateWeights } from "../lib/bookForm";

describe("book form helpers", () => {
  it("rejects invalid weight totals", () => {
    expect(validateWeights([0, 0])).toBe("Add at least one allocation with weight greater than zero.");
    expect(validateWeights([60, 50])).toBe("Book weights cannot exceed 100%.");
    expect(validateWeights([60, -1])).toBe("Book weights cannot be negative.");
  });

  it("surfaces workspace availability blockers", () => {
    expect(
      availabilityMessage({
        workspace_id: "workspace-1",
        opening_session: "2020-03-23",
        issues: [],
        tickers: [{ ticker: "QQQ", available: false, first_tradable_date: "2020-04-01" }],
      }),
    ).toBe("QQQ first becomes tradable on 2020-04-01.");
  });
});
