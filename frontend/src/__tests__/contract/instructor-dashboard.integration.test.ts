/**
 * Integration test: getInstructorDashboard()
 * Validates that the typed API function works correctly against the real backend.
 *
 * The InstructorDashboard response contains classes with nested sections.
 * DashboardSection may have camelCase fields (studentCount, activeSessionId)
 * or snake_case equivalents (student_count, active_session_id) depending on
 * the backend serialisation. This test validates whichever shape the API
 * actually returns, which is the point of contract testing.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { getInstructorDashboard } from '@/lib/api/instructor';
import { expectString, expectArray } from './validators';

describe('getInstructorDashboard()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns InstructorDashboard with classes array', async () => {
    const dashboard = await getInstructorDashboard();

    // Top-level: must have a classes array
    expectArray(dashboard, 'classes');
  });

  it('validates DashboardClass shape when classes exist', async () => {
    const dashboard = await getInstructorDashboard();

    if (dashboard.classes.length === 0) {
      console.warn('No classes in dashboard; skipping DashboardClass shape validation');
      return;
    }

    const cls = dashboard.classes[0];

    expectString(cls, 'id');
    expectString(cls, 'name');
    expectArray(cls, 'sections');
  });

  it('validates DashboardSection shape when sections exist', async () => {
    const dashboard = await getInstructorDashboard();

    // Find the first class that has sections
    const classWithSections = dashboard.classes.find(
      (c) => Array.isArray(c.sections) && c.sections.length > 0
    );

    if (!classWithSections) {
      console.warn('No sections in dashboard; skipping DashboardSection shape validation');
      return;
    }

    const section = classWithSections.sections[0];

    // Fields that are always present regardless of naming convention
    expectString(section, 'id');
    expectString(section, 'name');
    expectString(section, 'join_code');

    // semester is optional
    if ('semester' in section && section.semester !== undefined) {
      expect(typeof section.semester).toBe('string');
    }

    // Student count may come as camelCase (studentCount) or snake_case (student_count)
    const hasStudentCount = 'studentCount' in section || 'student_count' in section;
    expect(hasStudentCount).toBe(true);

    if ('studentCount' in section) {
      expect(typeof section.studentCount).toBe('number');
    }
    if ('student_count' in section) {
      expect(typeof (section as Record<string, unknown>).student_count).toBe('number');
    }

    // Active session ID may come as camelCase or snake_case; it is optional
    if ('activeSessionId' in section && section.activeSessionId !== undefined) {
      expect(typeof section.activeSessionId).toBe('string');
    }
    if ('active_session_id' in section && (section as Record<string, unknown>).active_session_id !== undefined) {
      expect(typeof (section as Record<string, unknown>).active_session_id).toBe('string');
    }
  });
});
