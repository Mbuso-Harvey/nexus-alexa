/**
 * CompositeSubstrate routing tests.
 *
 * Proves the switchboard that lets the demo present the full cross-substrate vision while
 * staying truthful: each substrate routes to its own backing, and backingOf() reports
 * "real" vs "fake" per substrate so the client can label live vs simulated steps.
 */

import { describe, expect, it } from "vitest";
import { FakeNexusSubstrate } from "../src/nexus/substrate.js";
import { CompositeSubstrate } from "../src/nexus/composite.js";
import { Orchestrator, directToolCaller } from "../src/orchestrator.js";
import { ScenarioPlanBuilder } from "../src/plan.js";

describe("CompositeSubstrate", () => {
  it("routes each substrate to its bound backing and reports backing", async () => {
    const fakeAll = new FakeNexusSubstrate({ ready: "all" });
    const composite = new CompositeSubstrate([
      { substrate: "firefox", impl: fakeAll, backing: "real" },
      { substrate: "chrome", impl: fakeAll, backing: "real" },
      { substrate: "windows", impl: fakeAll, backing: "fake" },
    ]);

    expect((await composite.availableSubstrates()).sort()).toEqual([
      "chrome",
      "firefox",
      "windows",
    ]);
    expect(composite.backingOf("firefox")).toBe("real");
    expect(composite.backingOf("windows")).toBe("fake");
    expect(composite.backingOf("android")).toBeNull();

    // A query on a bound substrate is delegated correctly.
    const nodes = await composite.query({ substrate: "firefox", find: "theme" });
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("throws for an unbound substrate (fail-closed, never silent)", async () => {
    const composite = new CompositeSubstrate([
      { substrate: "firefox", impl: new FakeNexusSubstrate(), backing: "fake" },
    ]);
    await expect(composite.read("android", "x")).rejects.toThrow(/no binding/);
  });

  it("runs the full review plan through a mixed real/fake composite", async () => {
    const fakeAll = new FakeNexusSubstrate({ ready: "all" });
    const composite = new CompositeSubstrate([
      { substrate: "firefox", impl: fakeAll, backing: "real" },
      { substrate: "chrome", impl: fakeAll, backing: "fake" },
      { substrate: "windows", impl: fakeAll, backing: "fake" },
    ]);
    const plan = new ScenarioPlanBuilder().build("get me set up for the Acme review")!;
    const orch = new Orchestrator(directToolCaller(composite));
    const result = await orch.run(plan, { confirm: async () => true });
    expect(result.ok).toBe(true);
  });
});
