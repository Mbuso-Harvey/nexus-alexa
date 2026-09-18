/**
 * Bedrock planner (AWS Builder) tests — hermetic, no AWS calls.
 *
 * Verifies:
 *  - With no AWS credentials, BedrockPlanBuilder.buildAsync returns null (graceful fallback).
 *  - The AsyncCompositePlanBuilder falls back to the deterministic planner and reports plannedBy.
 *  - When an async planner DOES return a plan, it is used and labeled "bedrock".
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BedrockPlanBuilder } from "../src/plan-bedrock.js";
import {
  AsyncCompositePlanBuilder,
  CompositePlanBuilder,
  LiveWebPlanBuilder,
  ScenarioPlanBuilder,
  type AsyncPlanBuilder,
  type Plan,
} from "../src/plan.js";

const AWS_ENV = [
  "AWS_ACCESS_KEY_ID",
  "AWS_PROFILE",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
];

describe("BedrockPlanBuilder", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of AWS_ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of AWS_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reports credentials absent and buildAsync returns null (fallback path)", async () => {
    expect(BedrockPlanBuilder.credentialsPresent()).toBe(false);
    const b = new BedrockPlanBuilder();
    expect(await b.buildAsync("do something clever")).toBeNull();
  });

  it("sync build() always returns null (async-only planner)", () => {
    expect(new BedrockPlanBuilder().build("x")).toBeNull();
  });
});

describe("AsyncCompositePlanBuilder", () => {
  const deterministic = new CompositePlanBuilder([
    new LiveWebPlanBuilder(),
    new ScenarioPlanBuilder(),
  ]);

  it("falls back to deterministic planner when async returns null, labeled deterministic", async () => {
    const nullAsync: AsyncPlanBuilder = { buildAsync: async () => null };
    const composite = new AsyncCompositePlanBuilder(nullAsync, deterministic);
    const { plan, plannedBy } = await composite.build("switch to dark mode");
    expect(plan).not.toBeNull();
    expect(plannedBy).toBe("deterministic");
  });

  it("uses the async plan when present, labeled bedrock", async () => {
    const fakePlan: Plan = {
      objective: "x",
      intro: "i",
      steps: [{ id: "b1", say: "read", substrate: "firefox", kind: "read", target: "settings.theme" }],
      outro: "o",
    };
    const okAsync: AsyncPlanBuilder = { buildAsync: async () => fakePlan };
    const composite = new AsyncCompositePlanBuilder(okAsync, deterministic);
    const { plan, plannedBy } = await composite.build("anything at all");
    expect(plan).toBe(fakePlan);
    expect(plannedBy).toBe("bedrock");
  });

  it("recovers to deterministic if the async planner throws", async () => {
    const throwAsync: AsyncPlanBuilder = {
      buildAsync: async () => {
        throw new Error("bedrock unavailable");
      },
    };
    const composite = new AsyncCompositePlanBuilder(throwAsync, deterministic);
    const { plan, plannedBy } = await composite.build("get me set up for the review");
    expect(plan).not.toBeNull();
    expect(plannedBy).toBe("deterministic");
  });
});
