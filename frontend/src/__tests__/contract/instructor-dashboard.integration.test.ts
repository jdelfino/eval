/**
 * Integration test: getInstructorDashboard()
 * Validates that the typed API function works correctly against the real backend.
 *
 * The InstructorDashboard response contains classes with nested sections.
 * The DashboardSection interface declares camelCase fields (studentCount,
 * activeSessionId). Since apiGet() passes JSON through without transformation,
 * the backend must be sending camelCase for these fields. The contract test
 * asserts the camelCase convention that matches the TypeScript interface.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { getInstructorDashboard } from '@/lib/api/instructor';
import { expectString, expectArray, expectNumber } from './validators';

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

    // Fields that match the DashboardSection interface (camelCase convention)
    expectString(section, 'id');
    expectString(section, 'name');
    expectString(section, 'join_code');

    // semester is optional per the interface
    if ('semester' in section && section.semester !== undefined) {
      expect(typeof section.semester).toBe('string');
    }

    // studentCount is declared as number in DashboardSection
    expectNumber(section, 'studentCount');

    // activeSessionId is optional per the interface
    if ('activeSessionId' in section && section.activeSessionId !== undefined) {
      expect(typeof section.activeSessionId).toBe('string');
    }
  });
});
