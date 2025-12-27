/**
 * Integration tests for projects CLI commands
 *
 * These tests require LINEAR_API_TOKEN to be set in environment.
 * If not set, tests will be skipped.
 *
 * NOTE: Create/update/archive tests are skipped by default to avoid
 * creating test data in production Linear workspaces.
 */

import { describe, expect, it } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const CLI_PATH = "dist/main.js";
const hasApiToken = !!process.env.LINEAR_API_TOKEN;

if (!hasApiToken) {
  console.warn(
    "\n  LINEAR_API_TOKEN not set - skipping projects integration tests\n" +
      "   To run these tests, set LINEAR_API_TOKEN in your environment\n",
  );
}

describe("Projects CLI", () => {
  describe("projects --help", () => {
    it("should display help with all subcommands", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} projects --help`);

      expect(stdout).toContain("Usage: linearis projects");
      expect(stdout).toContain("Project operations");
      expect(stdout).toContain("list");
      expect(stdout).toContain("read");
      expect(stdout).toContain("create");
      expect(stdout).toContain("update");
      expect(stdout).toContain("archive");
    });
  });

  describe("projects list", () => {
    it.skipIf(!hasApiToken)("should list projects as JSON array", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} projects list`);
      const projects = JSON.parse(stdout);

      expect(Array.isArray(projects)).toBe(true);
      if (projects.length > 0) {
        expect(projects[0]).toHaveProperty("id");
        expect(projects[0]).toHaveProperty("name");
        expect(projects[0]).toHaveProperty("state");
        expect(projects[0]).toHaveProperty("progress");
        expect(projects[0]).toHaveProperty("teams");
      }
    });

    it.skipIf(!hasApiToken)("should respect limit option", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} projects list --limit 5`,
      );
      const projects = JSON.parse(stdout);

      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeLessThanOrEqual(5);
    });

    it("should show help for list command", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} projects list --help`,
      );

      expect(stdout).toContain("--limit");
      expect(stdout).toContain("--include-archived");
    });
  });

  describe("projects read", () => {
    it.skipIf(!hasApiToken)(
      "should read project by name and return full details",
      async () => {
        // First get a project name from the list
        const { stdout: listOutput } = await execAsync(
          `node ${CLI_PATH} projects list --limit 1`,
        );
        const projects = JSON.parse(listOutput);

        if (projects.length > 0) {
          const { stdout } = await execAsync(
            `node ${CLI_PATH} projects read "${projects[0].name}"`,
          );
          const project = JSON.parse(stdout);

          expect(project.id).toBe(projects[0].id);
          expect(project.name).toBe(projects[0].name);
          expect(project).toHaveProperty("teams");
          // Read command includes additional fields
          expect(project).toHaveProperty("projectMilestones");
          expect(project).toHaveProperty("issues");
        }
      },
      { timeout: 30000 },
    );

    it.skipIf(!hasApiToken)("should read project by UUID", async () => {
      // First get a project UUID from the list
      const { stdout: listOutput } = await execAsync(
        `node ${CLI_PATH} projects list --limit 1`,
      );
      const projects = JSON.parse(listOutput);

      if (projects.length > 0) {
        const { stdout } = await execAsync(
          `node ${CLI_PATH} projects read ${projects[0].id}`,
        );
        const project = JSON.parse(stdout);

        expect(project.id).toBe(projects[0].id);
      }
    });

    it("should show help for read command", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} projects read --help`,
      );

      expect(stdout).toContain("projectIdOrName");
      expect(stdout).toContain("--milestones-first");
      expect(stdout).toContain("--issues-first");
    });
  });

  describe("projects create", () => {
    it("should require --team flag", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} projects create "Test Project" 2>&1`,
      ).catch((e) => ({ stdout: e.stderr || e.stdout }));

      expect(stdout).toContain("required option");
      expect(stdout).toContain("--team");
    });

    it("should show help for create command", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} projects create --help`,
      );

      expect(stdout).toContain("--team");
      expect(stdout).toContain("--description");
      expect(stdout).toContain("--lead");
      expect(stdout).toContain("--priority");
      expect(stdout).toContain("--start-date");
      expect(stdout).toContain("--target-date");
    });

    it.skip("should create a project with required fields", async () => {
      // Command: linearis projects create "Test Project" --team ABC
      // Expected: JSON object with created project
      // Skipped to avoid creating test data in production

      if (!hasApiToken) return;
    });
  });

  describe("projects update", () => {
    it("should show help for update command", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} projects update --help`,
      );

      expect(stdout).toContain("projectIdOrName");
      expect(stdout).toContain("--name");
      expect(stdout).toContain("--description");
      expect(stdout).toContain("--lead");
      expect(stdout).toContain("--clear-lead");
      expect(stdout).toContain("--start-date");
      expect(stdout).toContain("--clear-start-date");
      expect(stdout).toContain("--target-date");
      expect(stdout).toContain("--clear-target-date");
    });

    it.skip("should update project name", async () => {
      // Command: linearis projects update "Test Project" --name "New Name"
      // Expected: JSON object with updated project
      // Skipped to avoid modifying production data

      if (!hasApiToken) return;
    });
  });

  describe("projects update - validation", () => {
    it("should error when using --lead and --clear-lead together", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} projects update test-project --lead abc --clear-lead 2>&1`,
      ).catch((e) => ({ stdout: e.stdout }));

      const result = JSON.parse(stdout);
      expect(result.error).toContain(
        "Cannot use --lead and --clear-lead together",
      );
    });

    it("should error when using --start-date and --clear-start-date together", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} projects update test-project --start-date 2025-01-01 --clear-start-date 2>&1`,
      ).catch((e) => ({ stdout: e.stdout }));

      const result = JSON.parse(stdout);
      expect(result.error).toContain(
        "Cannot use --start-date and --clear-start-date together",
      );
    });

    it("should error when using --target-date and --clear-target-date together", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} projects update test-project --target-date 2025-12-31 --clear-target-date 2>&1`,
      ).catch((e) => ({ stdout: e.stdout }));

      const result = JSON.parse(stdout);
      expect(result.error).toContain(
        "Cannot use --target-date and --clear-target-date together",
      );
    });
  });

  describe("projects archive", () => {
    it("should show help for archive command", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} projects archive --help`,
      );

      expect(stdout).toContain("projectIdOrName");
      expect(stdout).toContain("Archive a project");
    });

    it.skip("should archive a project", async () => {
      // Command: linearis projects archive "Test Project"
      // Expected: { archived: true, id: "..." }
      // Skipped to avoid archiving production data

      if (!hasApiToken) return;
    });
  });
});
