/**
 * Integration test: getInstructorDashboard()
 * Validates that the typed API function works correctly against the real backend.
 *
 * The InstructorDashboard response contains classes with nested sections.
 * The DashboardSection interface declares camelCase fields (studentCount,
 * currentSessionId, lastActivity). Since apiGet() passes JSON through without
 * transformation, the backend must be sending camelCase for these fields. The
 * contract test asserts the camelCase convention that matches the TypeScript
 * interface. G4 (T13): the live indicator is the section pointer
 * (currentSessionId) plus the pointer session's lastActivity, NOT the retired
 * status='active'-derived activeSessionId.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { getInstructorDashboard } from '@/lib/api/instructor';

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
    expect(Array.isArray(dashboard.classes)).toBe(true);
  });

  it('validates DashboardClass shape when classes exist', async () => {
    const dashboard = await getInstructorDashboard();

    if (dashboard.classes.length === 0) {
      console.warn('No classes in dashboard; skipping DashboardClass shape validation');
      return;
    }

    const cls = dashboard.classes[0];

    expect(typeof cls.id).toBe('string');
    expect(typeof cls.name).toBe('string');
    expect(Array.isArray(cls.sections)).toBe(true);
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
    expect(typeof section.id).toBe('string');
    expect(typeof section.name).toBe('string');
    expect(typeof section.join_code).toBe('string');

    // semester is optional per the interface
    if ('semester' in section && section.semester !== undefined) {
      expect(typeof section.semester).toBe('string');
    }

    // studentCount is declared as number in DashboardSection
    expect(typeof section.studentCount).toBe('number');

    // currentSessionId (section pointer) is optional per the interface
    if ('currentSessionId' in section && section.currentSessionId !== undefined) {
      expect(typeof section.currentSessionId).toBe('string');
    }

    // lastActivity (pointer session's last_activity) is optional per the interface;
    // present (ISO 8601 string) only when the pointer is set.
    if ('lastActivity' in section && section.lastActivity !== undefined) {
      expect(typeof section.lastActivity).toBe('string');
    }
  });
});
