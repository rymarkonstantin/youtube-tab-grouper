import { MESSAGE_ACTIONS, validateRequest } from "../../src/shared/messageContracts";
import { withStatsDefaults, migrateStatsV0ToV1, STATS_VERSION } from "../../src/shared/stats";
import { withSettingsDefaults, SETTINGS_VERSION } from "../../src/shared/settings";
import type { Metadata } from "../../src/shared/types";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertValidRequest() {
  const metadata: Metadata = {
    title: "Test title",
    channel: "Channel",
    description: "Desc",
    keywords: ["test"],
    youtubeCategory: "Music"
  };

  const requestPayload = {
    action: MESSAGE_ACTIONS.GROUP_TAB,
    version: 1,
    requestId: "test_req",
    metadata
  };

  const result = validateRequest(MESSAGE_ACTIONS.GROUP_TAB, requestPayload);
  assert(result.valid, `GROUP_TAB request should validate: ${result.errors.join(", ")}`);
}

function assertInvalidRequest() {
  const badPayload = {
    action: MESSAGE_ACTIONS.GROUP_TAB,
    version: 1,
    requestId: "test_req",
    metadata: {} as unknown // missing fields
  } as Record<string, unknown>;
  const result = validateRequest(MESSAGE_ACTIONS.GROUP_TAB, badPayload);
  assert(!result.valid, "Invalid metadata payload should fail validation");
}

function assertStatsMigration() {
  const legacyStats = { totalTabs: 2, categoryCount: { Music: 2 }, version: 0 };
  const migrated = migrateStatsV0ToV1(legacyStats);
  assert(migrated.version === STATS_VERSION, "Stats migration should bump version");
  const defaultsApplied = withStatsDefaults({});
  assert(defaultsApplied.categoryCount !== undefined, "Stats defaults should populate categoryCount");
}

function assertSettingsDefaults() {
  const normalized = withSettingsDefaults({ extensionEnabled: false });
  assert(normalized.version === SETTINGS_VERSION, "Settings defaults should set version");
  assert(normalized.extensionEnabled === false, "Settings defaults should respect explicit flags");
}

function run() {
  assertValidRequest();
  assertInvalidRequest();
  assertStatsMigration();
  assertSettingsDefaults();
  console.log("Smoke tests passed.");
}

try {
  run();
} catch (error) {
  console.error("Smoke tests failed:", error);
  process.exit(1);
}
