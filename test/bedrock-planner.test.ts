/**
 * Bedrock planner (AWS Builder) tests — hermetic, no AWS network calls.
 *
 * Verifies:
 *  - Credential detection goes through the standard AWS SDK credential provider chain
 *    (env -> SSO -> shared INI files -> IMDS), so the normal default profile created by
 *    `aws configure` is detected WITHOUT requiring AWS_PROFILE or explicit access-key
 *    environment variables.
 *  - With no AWS configuration at all, the chain resolves false, buildAsync returns null,
 *    and the AsyncCompositePlanBuilder falls back to the deterministic planner (plannedBy).
 *  - When an async planner DOES return a plan, it is used and labeled "bedrock".
 *
 * Hermeticity: the machine running this suite may have a real default profile in ~/.aws
 * (which the chain legitimately detects). Every test therefore isolates the FULL chain:
 * shared INI files pointed at controlled temp files, IMDS disabled, and all AWS env vars
 * saved/cleared. The per-process credential memo is reset between tests via resetModules.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BedrockPlanBuilder } from "../src/plan-bedrock.js";
import {
  AsyncCompositePlanBuilder,
  CompositePlanBuilder,
  LiveWebPlanBuilder,
  ScenarioPlanBuilder,
  type AsyncPlanBuilder,
  type Plan,
} from "../src/plan.js";

// Every env var that can influence the AWS SDK credential provider chain.
const AWS_ENV = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_PROFILE",
  "AWS_REGION",
  "AWS_CONFIG_FILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_EC2_METADATA_DISABLED",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
];

describe("BedrockPlanBuilder", () => {
  const saved: Record<string, string | undefined> = {};
  const tempDirs: string[] = [];

  beforeEach(() => {
    for (const k of AWS_ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    // Isolate the chain from the machine's real ~/.aws and disable the IMDS probe so
    // resolution is deterministic, offline, and fast. With no other source configured,
    // the chain fails closed (regression-asserted below).
    process.env.AWS_PROFILE = "default";
    process.env.AWS_SHARED_CREDENTIALS_FILE = "no-such-credentials-file";
    process.env.AWS_CONFIG_FILE = "no-such-config-file";
    process.env.AWS_EC2_METADATA_DISABLED = "true";
  });

  afterEach(() => {
    for (const k of AWS_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
    // credentialsPresent is memoized per process; reset module state so each test
    // exercises the credential chain against its own environment.
    vi.resetModules();
  });

  /** Fresh module instance so the per-process memo does not leak between tests. */
  async function freshClass() {
    const { BedrockPlanBuilder: Fresh } = await import("../src/plan-bedrock.js");
    return Fresh;
  }

  it("reports credentials absent via the SDK chain; buildAsync returns null (fallback path)", async () => {
    const Fresh = await freshClass();
    await expect(Fresh.credentialsPresent()).resolves.toBe(false);
    const b = new Fresh();
    expect(await b.buildAsync("do something clever")).toBeNull();
  });

  it("detects credentials from explicit environment variables (env provider)", async () => {
    // No AWS_PROFILE: the SDK's default provider treats a profile + static-env pair as a
    // credential source conflict and prefers the profile, so this test isolates the env
    // source on its own.
    delete process.env.AWS_PROFILE;
    process.env.AWS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-access-key";
    const Fresh = await freshClass();
    await expect(Fresh.credentialsPresent()).resolves.toBe(true);
  });

  it("detects the normal default profile created by aws configure (shared INI file, no env vars)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nexus-alexa-aws-probe-"));
    tempDirs.push(dir);
    // Exactly what `aws configure` writes: a [default] profile in the shared
    // credentials file. The chain must find it without AWS_PROFILE- or
    // access-key-env-var requirements.
    writeFileSync(
      join(dir, "credentials"),
      "[default]\naws_access_key_id = test-key-id\naws_secret_access_key = test-secret\n",
    );
    process.env.AWS_SHARED_CREDENTIALS_FILE = join(dir, "credentials");
    process.env.AWS_CONFIG_FILE = join(dir, "config");
    const Fresh = await freshClass();
    await expect(Fresh.credentialsPresent()).resolves.toBe(true);
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
