/**
 * GraphQL queries and mutations for project operations
 *
 * These queries provide optimized single-request fetching for project data,
 * avoiding N+1 query problems from SDK relationship fetching.
 */

import { COMPLETE_ISSUE_FRAGMENT } from "./common.js";

/**
 * Core project fields fragment for reuse
 */
export const PROJECT_CORE_FIELDS = `
  id
  name
  description
  slugId
  icon
  color
  state
  progress
  priority
  sortOrder
  startDate
  targetDate
  createdAt
  updatedAt
`;

/**
 * Project lead relationship
 */
export const PROJECT_LEAD_FRAGMENT = `
  lead {
    id
    name
  }
`;

/**
 * Project teams relationship
 */
export const PROJECT_TEAMS_FRAGMENT = `
  teams {
    nodes {
      id
      key
      name
    }
  }
`;

/**
 * Complete project fragment with all relationships
 */
export const COMPLETE_PROJECT_FRAGMENT = `
  ${PROJECT_CORE_FIELDS}
  ${PROJECT_LEAD_FRAGMENT}
  ${PROJECT_TEAMS_FRAGMENT}
`;

/**
 * List all projects with relationships
 */
export const LIST_PROJECTS_QUERY = `
  query ListProjects($first: Int!, $includeArchived: Boolean) {
    projects(first: $first, includeArchived: $includeArchived, orderBy: updatedAt) {
      nodes {
        ${COMPLETE_PROJECT_FRAGMENT}
      }
    }
  }
`;

/**
 * Get single project by ID with full details including milestones and issues
 */
export const GET_PROJECT_BY_ID_QUERY = `
  query GetProject($id: String!, $milestonesFirst: Int, $issuesFirst: Int) {
    project(id: $id) {
      ${COMPLETE_PROJECT_FRAGMENT}
      members {
        nodes {
          id
          name
        }
      }
      projectMilestones(first: $milestonesFirst) {
        nodes {
          id
          name
          description
          targetDate
          sortOrder
        }
      }
      issues(first: $issuesFirst) {
        nodes {
          ${COMPLETE_ISSUE_FRAGMENT}
        }
      }
    }
  }
`;

/**
 * Find project by name (case-insensitive) for name-based ID resolution
 */
export const FIND_PROJECT_BY_NAME_QUERY = `
  query FindProjectByName($name: String!) {
    projects(filter: { name: { eqIgnoreCase: $name } }, first: 10) {
      nodes {
        id
        name
        state
      }
    }
  }
`;

/**
 * Create a new project
 */
export const CREATE_PROJECT_MUTATION = `
  mutation CreateProject(
    $name: String!
    $teamIds: [String!]!
    $description: String
    $icon: String
    $color: String
    $leadId: String
    $priority: Int
    $startDate: TimelessDate
    $targetDate: TimelessDate
  ) {
    projectCreate(input: {
      name: $name
      teamIds: $teamIds
      description: $description
      icon: $icon
      color: $color
      leadId: $leadId
      priority: $priority
      startDate: $startDate
      targetDate: $targetDate
    }) {
      success
      project {
        ${COMPLETE_PROJECT_FRAGMENT}
      }
    }
  }
`;

/**
 * Update an existing project
 */
export const UPDATE_PROJECT_MUTATION = `
  mutation UpdateProject(
    $id: String!
    $name: String
    $description: String
    $icon: String
    $color: String
    $leadId: String
    $priority: Int
    $startDate: TimelessDate
    $targetDate: TimelessDate
    $teamIds: [String!]
  ) {
    projectUpdate(id: $id, input: {
      name: $name
      description: $description
      icon: $icon
      color: $color
      leadId: $leadId
      priority: $priority
      startDate: $startDate
      targetDate: $targetDate
      teamIds: $teamIds
    }) {
      success
      project {
        ${COMPLETE_PROJECT_FRAGMENT}
      }
    }
  }
`;

/**
 * Archive a project (soft-delete)
 */
export const ARCHIVE_PROJECT_MUTATION = `
  mutation ArchiveProject($id: String!) {
    projectArchive(id: $id) {
      success
    }
  }
`;
