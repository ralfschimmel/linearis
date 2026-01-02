import { Command } from "commander";
import { createGraphQLService } from "../utils/graphql-service.js";
import { createLinearService } from "../utils/linear-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";
import {
  ARCHIVE_PROJECT_MUTATION,
  CREATE_PROJECT_MUTATION,
  FIND_PROJECT_BY_NAME_QUERY,
  GET_PROJECT_BY_ID_QUERY,
  LIST_PROJECTS_QUERY,
  UPDATE_PROJECT_MUTATION,
} from "../queries/projects.js";
import { isUuid } from "../utils/uuid.js";
import type {
  ProjectCreateOptions,
  ProjectListOptions,
  ProjectReadOptions,
  ProjectUpdateOptions,
} from "../utils/linear-types.js";
import type { GraphQLService } from "../utils/graphql-service.js";
import {
  multipleMatchesError,
  notFoundError,
} from "../utils/error-messages.js";

/**
 * Transform GraphQL project response to normalize teams and other nested structures
 */
function transformProject(project: any): any {
  if (!project) return project;

  return {
    ...project,
    // Flatten teams.nodes to teams array
    teams: project.teams?.nodes || [],
    // Flatten members.nodes to members array (if present)
    members: project.members?.nodes,
    // Flatten projectMilestones.nodes to projectMilestones array (if present)
    projectMilestones: project.projectMilestones?.nodes,
    // Flatten issues.nodes to issues array (if present)
    issues: project.issues?.nodes,
  };
}

/**
 * Helper function to resolve project ID from name or UUID
 *
 * @param projectNameOrId - Project name or UUID
 * @param graphQLService - GraphQL service instance
 * @returns Project UUID
 * @throws Error if project not found or multiple matches
 */
async function resolveProjectIdFromGraphQL(
  projectNameOrId: string,
  graphQLService: GraphQLService,
): Promise<string> {
  if (isUuid(projectNameOrId)) {
    return projectNameOrId;
  }

  const result = await graphQLService.rawRequest(FIND_PROJECT_BY_NAME_QUERY, {
    name: projectNameOrId,
  });

  const nodes = result.projects?.nodes || [];

  if (nodes.length === 0) {
    throw notFoundError("Project", projectNameOrId);
  }

  if (nodes.length > 1) {
    const matches = nodes.map((p: any) => `"${p.name}" (${p.state})`);
    throw multipleMatchesError(
      "project",
      projectNameOrId,
      matches,
      "use the project ID",
    );
  }

  return nodes[0].id;
}

/**
 * Setup projects commands on the program
 *
 * Registers `projects` command group for Linear project management.
 * Provides CRUD operations: list, read, create, update, archive.
 *
 * @param program - Commander.js program instance to register commands on
 *
 * @example
 * ```typescript
 * // In main.ts
 * setupProjectsCommands(program);
 * // Enables: linearis projects list|read|create|update|archive
 * ```
 */
export function setupProjectsCommands(program: Command): void {
  const projects = program
    .command("projects")
    .description("Project operations");

  // Show projects help when no subcommand
  projects.action(() => {
    projects.help();
  });

  // ============================================================================
  // LIST Command
  // ============================================================================
  projects
    .command("list")
    .description("List projects")
    .option("-l, --limit <number>", "limit results", "100")
    .option("--include-archived", "include archived projects")
    .action(
      handleAsyncCommand(
        async (options: ProjectListOptions, command: Command) => {
          const graphQLService = await createGraphQLService(
            command.parent!.parent!.opts(),
          );

          const result = await graphQLService.rawRequest(LIST_PROJECTS_QUERY, {
            first: parseInt(options.limit || "100"),
            includeArchived: options.includeArchived || false,
          });

          const projects = (result.projects?.nodes || []).map(transformProject);
          outputSuccess(projects);
        },
      ),
    );

  // ============================================================================
  // READ Command
  // ============================================================================
  projects
    .command("read <projectIdOrName>")
    .description(
      "Get project details including milestones and issues. Accepts UUID or project name.",
    )
    .option(
      "--milestones-first <n>",
      "how many milestones to fetch (default 25)",
      "25",
    )
    .option(
      "--issues-first <n>",
      "how many issues to fetch (default 50)",
      "50",
    )
    .action(
      handleAsyncCommand(
        async (
          projectIdOrName: string,
          options: ProjectReadOptions,
          command: Command,
        ) => {
          const graphQLService = await createGraphQLService(
            command.parent!.parent!.opts(),
          );

          const projectId = await resolveProjectIdFromGraphQL(
            projectIdOrName,
            graphQLService,
          );

          const milestonesFirst = parseInt(options.milestonesFirst ?? "25");
          const issuesFirst = parseInt(options.issuesFirst ?? "50");

          const result = await graphQLService.rawRequest(
            GET_PROJECT_BY_ID_QUERY,
            {
              id: projectId,
              milestonesFirst: milestonesFirst || 1, // API requires >= 1, use @skip when 0
              issuesFirst: issuesFirst || 1,
              skipMilestones: milestonesFirst === 0,
              skipIssues: issuesFirst === 0,
            },
          );

          if (!result.project) {
            throw notFoundError("Project", projectIdOrName);
          }

          outputSuccess(transformProject(result.project));
        },
      ),
    );

  // ============================================================================
  // CREATE Command
  // ============================================================================
  projects
    .command("create <name>")
    .description("Create a new project")
    .requiredOption("--team <team>", "team key, name, or ID (required)")
    .option("-d, --description <description>", "project description")
    .option("--icon <icon>", "project icon")
    .option("--color <color>", "project color (hex code)")
    .option("--lead <lead>", "project lead user ID")
    .option(
      "--priority <priority>",
      "priority (0=none, 1=urgent, 2=high, 3=normal, 4=low)",
    )
    .option("--start-date <date>", "start date (YYYY-MM-DD)")
    .option("--target-date <date>", "target date (YYYY-MM-DD)")
    .action(
      handleAsyncCommand(
        async (
          name: string,
          options: ProjectCreateOptions,
          command: Command,
        ) => {
          const [graphQLService, linearService] = await Promise.all([
            createGraphQLService(command.parent!.parent!.opts()),
            createLinearService(command.parent!.parent!.opts()),
          ]);

          // Resolve team ID using LinearService
          const teamId = await linearService.resolveTeamId(options.team);

          const result = await graphQLService.rawRequest(
            CREATE_PROJECT_MUTATION,
            {
              name,
              teamIds: [teamId],
              description: options.description,
              icon: options.icon,
              color: options.color,
              leadId: options.lead,
              priority: options.priority
                ? parseInt(options.priority)
                : undefined,
              startDate: options.startDate,
              targetDate: options.targetDate,
            },
          );

          if (!result.projectCreate?.success) {
            throw new Error("Failed to create project");
          }

          outputSuccess(transformProject(result.projectCreate.project));
        },
      ),
    );

  // ============================================================================
  // UPDATE Command
  // ============================================================================
  projects
    .command("update <projectIdOrName>")
    .description(
      "Update an existing project. Accepts UUID or project name.",
    )
    .option("-n, --name <name>", "new project name")
    .option("-d, --description <description>", "new description")
    .option("--icon <icon>", "new icon")
    .option("--color <color>", "new color (hex code)")
    .option("--lead <lead>", "new lead user ID")
    .option("--clear-lead", "remove project lead")
    .option(
      "--priority <priority>",
      "new priority (0=none, 1=urgent, 2=high, 3=normal, 4=low)",
    )
    .option("--start-date <date>", "new start date (YYYY-MM-DD)")
    .option("--clear-start-date", "remove start date")
    .option("--target-date <date>", "new target date (YYYY-MM-DD)")
    .option("--clear-target-date", "remove target date")
    .option("--team <team>", "add team association (key, name, or ID)")
    .action(
      handleAsyncCommand(
        async (
          projectIdOrName: string,
          options: ProjectUpdateOptions,
          command: Command,
        ) => {
          // Validate mutually exclusive flags
          if (options.lead && options.clearLead) {
            throw new Error("Cannot use --lead and --clear-lead together");
          }
          if (options.startDate && options.clearStartDate) {
            throw new Error(
              "Cannot use --start-date and --clear-start-date together",
            );
          }
          if (options.targetDate && options.clearTargetDate) {
            throw new Error(
              "Cannot use --target-date and --clear-target-date together",
            );
          }

          const [graphQLService, linearService] = await Promise.all([
            createGraphQLService(command.parent!.parent!.opts()),
            createLinearService(command.parent!.parent!.opts()),
          ]);

          const projectId = await resolveProjectIdFromGraphQL(
            projectIdOrName,
            graphQLService,
          );

          // Build update variables (only include provided fields)
          const updateVars: Record<string, any> = { id: projectId };

          if (options.name !== undefined) updateVars.name = options.name;
          if (options.description !== undefined) {
            updateVars.description = options.description;
          }
          if (options.icon !== undefined) updateVars.icon = options.icon;
          if (options.color !== undefined) updateVars.color = options.color;
          if (options.priority !== undefined) {
            updateVars.priority = parseInt(options.priority);
          }

          // Handle lead
          if (options.clearLead) {
            updateVars.leadId = null;
          } else if (options.lead !== undefined) {
            updateVars.leadId = options.lead;
          }

          // Handle dates
          if (options.clearStartDate) {
            updateVars.startDate = null;
          } else if (options.startDate !== undefined) {
            updateVars.startDate = options.startDate;
          }

          if (options.clearTargetDate) {
            updateVars.targetDate = null;
          } else if (options.targetDate !== undefined) {
            updateVars.targetDate = options.targetDate;
          }

          // Handle team association
          if (options.team !== undefined) {
            const teamId = await linearService.resolveTeamId(options.team);
            updateVars.teamIds = [teamId];
          }

          const result = await graphQLService.rawRequest(
            UPDATE_PROJECT_MUTATION,
            updateVars,
          );

          if (!result.projectUpdate?.success) {
            throw new Error("Failed to update project");
          }

          outputSuccess(transformProject(result.projectUpdate.project));
        },
      ),
    );

  // ============================================================================
  // ARCHIVE Command
  // ============================================================================
  projects
    .command("archive <projectIdOrName>")
    .description("Archive a project (soft-delete). Accepts UUID or project name.")
    .action(
      handleAsyncCommand(
        async (
          projectIdOrName: string,
          _options: unknown,
          command: Command,
        ) => {
          const graphQLService = await createGraphQLService(
            command.parent!.parent!.opts(),
          );

          const projectId = await resolveProjectIdFromGraphQL(
            projectIdOrName,
            graphQLService,
          );

          const result = await graphQLService.rawRequest(
            ARCHIVE_PROJECT_MUTATION,
            {
              id: projectId,
            },
          );

          if (!result.projectArchive?.success) {
            throw new Error("Failed to archive project");
          }

          outputSuccess({
            archived: true,
            id: projectId,
          });
        },
      ),
    );
}
