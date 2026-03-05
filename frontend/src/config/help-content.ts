/**
 * Help content configuration.
 * Defines role-aware help topics rendered on the /help page.
 */

import type { UserRole } from '@/types/api';

/** A help topic with its content and role visibility. */
export interface HelpTopic {
  /** Unique identifier for the topic */
  id: string;
  /** Display title shown in tabs or headings */
  title: string;
  /** Markdown content for the topic */
  content: string;
  /** Roles that can see this topic */
  roles: UserRole[];
}

/** Role hierarchy for permission checking */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  'student': 0,
  'instructor': 1,
  'namespace-admin': 2,
  'system-admin': 3,
};

/** Introductory text shown at the top of the help page. */
export const HELP_INTRO =
  'Welcome to Eval! This guide covers everything you need to get started and make the most of the platform.';

/** All help topics. Order determines tab/section display order. */
export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'student',
    title: 'Student Guide',
    content: `## Getting Started

### Joining a Section

Your instructor will provide a **join code** for your section. To join:

1. Sign in to Eval
2. Navigate to **My Sections**
3. Click **Join Section** and enter the join code provided by your instructor
4. You will be added to the section and can see it in your section list

### Working in a Coding Session

When your instructor starts a coding session, you will be able to work on the assigned problem:

- **Editor** - Write your code in the editor panel on the left side
- **Output** - See your program's output in the output panel on the right
- **Run** - Click the **Run** button or press \`Shift+Enter\` to execute your code
- Your work is **automatically saved** as you type

### Viewing Past Sessions

After a session ends, you can review your previous work:

1. Go to **My Sections** and select the section
2. View your session history to see past sessions
3. Click on a session to review your submitted code and output`,
    roles: ['student', 'instructor', 'namespace-admin', 'system-admin'],
  },
  {
    id: 'instructor',
    title: 'Instructor Guide',
    content: `## Instructor Guide

### Creating Classes and Sections

1. Navigate to **Classes** from the sidebar
2. Click **Create Class** and enter a name for your class
3. Within a class, create one or more **sections** (e.g., "Section A", "Morning Lab")
4. Each section has a unique **join code** - share this with your students so they can enroll

### Managing Problems

Problems are coding exercises you assign during sessions:

1. Go to **Problems** from the sidebar
2. Click **Create Problem** to add a new exercise
3. Write the problem description, starter code, and test cases
4. **Publish** the problem when it is ready to use in sessions

### Running Sessions

Sessions are live coding activities for a section:

1. From the **Dashboard**, select a section
2. Click **Start Session** and choose a problem
3. Students in the section will see the session and can begin coding
4. **Monitor** student progress in real-time from the session view
5. Click **End Session** when the activity is complete

### Monitoring Students

During an active session, you can:

- View **live code** from each student as they type
- See **run results** and output for each student
- Track which students have started working and their progress`,
    roles: ['instructor', 'namespace-admin', 'system-admin'],
  },
  {
    id: 'admin',
    title: 'Admin Guide',
    content: `## Admin Guide

### User Management

As an administrator, you can manage users in your organization:

1. Navigate to **User Management** from the sidebar
2. View all users and their roles
3. **Invite instructors** by sending email invitations
4. **Manage roles** - promote or change user roles as needed

### Managing Your Organization

- Review usage statistics from the admin dashboard
- Monitor active sessions across all sections
- Ensure instructors have the resources they need`,
    roles: ['namespace-admin', 'system-admin'],
  },
];

/**
 * Check if a string is a valid user role.
 */
function isValidRole(role: string): role is UserRole {
  return role in ROLE_HIERARCHY;
}

/**
 * Get help topics visible to a given role.
 * @param role - The user role to filter by
 * @returns Array of help topics the role can access
 */
export function getHelpTopicsForRole(role: string): HelpTopic[] {
  if (!isValidRole(role)) {
    return [];
  }

  return HELP_TOPICS.filter(topic => topic.roles.includes(role));
}
