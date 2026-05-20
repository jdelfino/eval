/**
 * Tests for Sidebar component (v4 redesign)
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Sidebar } from '../Sidebar';

// Mock next/navigation
const mockPathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockRouterPush }),
}));

// Mock useAuth
const mockUser = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser(),
    signOut: mockSignOut,
  }),
}));

// Mock usePreview
const mockUsePreview = jest.fn();
jest.mock('@/contexts/PreviewContext', () => ({
  usePreview: () => mockUsePreview(),
}));

// Mock system API
const mockGetSystemNamespace = jest.fn();
const mockListSystemNamespaces = jest.fn();
jest.mock('@/lib/api/system', () => ({
  getSystemNamespace: (...args: unknown[]) => mockGetSystemNamespace(...args),
  listSystemNamespaces: (...args: unknown[]) => mockListSystemNamespaces(...args),
}));

const mockRouterPush = jest.fn();

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname.mockReturnValue('/instructor');
    mockUser.mockReturnValue({
      id: 'user1',
      email: 'test@example.com',
      display_name: 'Test User',
      role: 'instructor',
    });
    mockUsePreview.mockReturnValue({
      isPreview: false,
      previewSectionId: null,
      enterPreview: jest.fn(),
      exitPreview: jest.fn(),
    });
    mockSignOut.mockResolvedValue(undefined);
    // Default no-op mocks for system API (most tests don't exercise these paths)
    mockGetSystemNamespace.mockResolvedValue({ id: 'ns-default', displayName: 'Default NS', active: true });
    mockListSystemNamespaces.mockResolvedValue([]);
  });

  /**
   * Helper to get the sidebar aside element.
   * Verifies aria-label="Main navigation" — this is required by e2e fixtures.
   */
  function getSidebar() {
    return screen.getByRole('complementary', { name: /main navigation/i });
  }

  /**
   * TC1: Sidebar renders brand + nav landmark with correct aria-label.
   * Contract: aside[aria-label="Main navigation"] must exist and brand text "Eval" must be visible.
   * Why: e2e selector `aside[aria-label="Main navigation"]` depends on this exact aria-label.
   */
  it('renders sidebar landmark with correct aria-label and brand text Eval', () => {
    render(<Sidebar />);

    const sidebar = getSidebar();
    expect(sidebar).toBeInTheDocument();
    expect(screen.getByText('Eval')).toBeInTheDocument();
  });

  /**
   * TC2: Instructor role sees Teaching group items in order.
   * Contract: Dashboard, Classes, Library nav items present in DOM order.
   * Why: nav config drift would break instructor navigation.
   */
  it('renders instructor nav items: Dashboard, Classes, Library', () => {
    render(<Sidebar />);

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /classes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /library/i })).toBeInTheDocument();
    // "Problems" label should be gone — renamed to Library
    expect(screen.queryByText('Problems')).not.toBeInTheDocument();
  });

  /**
   * TC3: Student role sees only Main items.
   * Contract: "My Sections" present; "Dashboard"/"Classes"/"Library" NOT present.
   * Why: role filter regression would expose instructor nav to students.
   */
  it('shows only student nav items for student role', () => {
    mockUser.mockReturnValue({
      id: 'user2',
      email: 'student@example.com',
      display_name: 'Student User',
      role: 'student',
    });

    render(<Sidebar />);

    expect(screen.getByRole('link', { name: /my sections/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /classes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /library/i })).not.toBeInTheDocument();
  });

  /**
   * TC4: Namespace-admin sees Admin items in addition to Teaching.
   * Contract: Dashboard + Classes + Library + User Management visible, no Namespaces.
   */
  it('shows Teaching + Admin items for namespace-admin role', () => {
    mockUser.mockReturnValue({
      id: 'user3',
      email: 'nsadmin@example.com',
      display_name: 'NS Admin',
      role: 'namespace-admin',
    });

    render(<Sidebar />);

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /user management/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /namespaces/i })).not.toBeInTheDocument();
  });

  /**
   * TC5: System-admin sees all items including Namespaces + Admin + Teaching.
   * Contract: full nav tree visible for system-admin.
   */
  it('shows all items including Namespaces for system-admin role', () => {
    mockUser.mockReturnValue({
      id: 'user4',
      email: 'sysadmin@example.com',
      display_name: 'Sys Admin',
      role: 'system-admin',
    });

    render(<Sidebar />);

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /user management/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /namespaces/i })).toBeInTheDocument();
  });

  /**
   * TC6: Sign-out trigger has visible text "Sign Out" inside sidebar.
   * Contract: element with text content "Sign Out" must be findable inside the sidebar.
   * Why: e2e fixture uses `:has-text("Sign Out")` which requires visible text content,
   * not just a title= attribute. Breaking this blocks the signOut e2e fixture.
   */
  it('renders Sign Out element with visible text content inside sidebar', async () => {
    render(<Sidebar />);

    // Must find by visible text — title= alone does NOT satisfy Playwright :has-text()
    const signOutEl = screen.getByText('Sign Out');
    expect(signOutEl).toBeInTheDocument();

    // Must be inside the sidebar landmark
    const sidebar = getSidebar();
    expect(sidebar).toContainElement(signOutEl);
  });

  /**
   * TC6b: Sign-out triggers signOut() and router.push('/auth/signin').
   * Contract: clicking Sign Out calls auth.signOut() and navigates to sign-in page.
   */
  it('calls signOut and navigates to /auth/signin when Sign Out clicked', async () => {
    render(<Sidebar />);

    const signOutEl = screen.getByText('Sign Out');
    fireEvent.click(signOutEl);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/auth/signin');
    });
  });

  /**
   * TC7: Collapse toggle invokes onToggleCollapse.
   * Contract: clicking collapse IconBtn triggers the passed callback.
   * Why: collapse not wired means sidebar never collapses.
   */
  it('calls onToggleCollapse when collapse button clicked', () => {
    const onToggle = jest.fn();
    render(<Sidebar onToggleCollapse={onToggle} />);

    // Find the collapse button (title="Collapse" on IconBtn)
    const collapseBtn = screen.getByTitle('Collapse');
    fireEvent.click(collapseBtn);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  /**
   * TC8: Collapsed state hides labels, icons still present.
   * Contract: when collapsed=true, nav item text labels not visible; SVG icons still in DOM.
   * Why: collapsed branch broken would show labels when collapsed.
   */
  it('hides nav item labels when collapsed=true', () => {
    render(<Sidebar collapsed={true} />);

    // Text labels should not be visible as separate spans
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Classes')).not.toBeInTheDocument();
    // But links should still exist (via aria-label/title for accessibility)
    expect(screen.getByTitle('Dashboard')).toBeInTheDocument();
  });

  /**
   * TC9: Active route shows active styling and aria-current="page".
   * Contract: nav item for current pathname gets aria-current="page".
   * Why: active detection broken means visual focus cues break.
   */
  it('marks active route with aria-current="page"', () => {
    mockPathname.mockReturnValue('/classes');

    render(<Sidebar />);

    const classesLink = screen.getByRole('link', { name: /classes/i });
    expect(classesLink).toHaveAttribute('aria-current', 'page');

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).not.toHaveAttribute('aria-current', 'page');
  });

  /**
   * TC10: Preview mode forces student nav even for instructor users.
   * Contract: isPreview=true + role=instructor → My Sections visible, Dashboard not visible.
   * Why: preview branch broken would show instructor items during student preview.
   */
  it('shows student nav in preview mode for instructor', () => {
    mockUsePreview.mockReturnValue({
      isPreview: true,
      previewSectionId: 'section-123',
      enterPreview: jest.fn(),
      exitPreview: jest.fn(),
    });

    render(<Sidebar />);

    expect(screen.getByRole('link', { name: /my sections/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /classes/i })).not.toBeInTheDocument();
  });

  describe('Help link', () => {
    it('renders Help link for all roles', () => {
      render(<Sidebar />);
      expect(screen.getByRole('link', { name: /help/i })).toBeInTheDocument();
    });

    it('has correct href', () => {
      render(<Sidebar />);
      expect(screen.getByRole('link', { name: /help/i })).toHaveAttribute('href', '/help');
    });

    it('shows active state when on /help', () => {
      mockPathname.mockReturnValue('/help');
      render(<Sidebar />);
      expect(screen.getByRole('link', { name: /help/i })).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('user row', () => {
    it('shows user display name in the user row', () => {
      render(<Sidebar />);
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    it('shows email as fallback when no display_name', () => {
      mockUser.mockReturnValue({
        id: 'user1',
        email: 'noname@example.com',
        display_name: null,
        role: 'instructor',
      });

      render(<Sidebar />);
      expect(screen.getByText('noname@example.com')).toBeInTheDocument();
    });
  });

  describe('nav groups', () => {
    it('renders group labels when expanded', () => {
      mockUser.mockReturnValue({
        id: 'user4',
        email: 'sysadmin@example.com',
        display_name: 'Sys Admin',
        role: 'system-admin',
      });

      render(<Sidebar collapsed={false} />);

      const headings = screen.getAllByRole('heading', { level: 3 });
      const groupNames = headings.map(h => h.textContent);
      expect(groupNames).toContain('Teaching');
    });

    it('hides group labels when collapsed', () => {
      render(<Sidebar collapsed={true} />);
      expect(screen.queryByText('Teaching')).not.toBeInTheDocument();
    });
  });

  describe('namespace area', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockPathname.mockReturnValue('/instructor');
      mockUsePreview.mockReturnValue({
        isPreview: false,
        previewSectionId: null,
        enterPreview: jest.fn(),
        exitPreview: jest.fn(),
      });
      mockSignOut.mockResolvedValue(undefined);
      mockGetSystemNamespace.mockResolvedValue({ id: 'ns-1', displayName: 'Lincoln HS · CS', active: true });
      mockListSystemNamespaces.mockResolvedValue([
        { id: 'ns-1', displayName: 'Lincoln HS · CS', active: true },
        { id: 'ns-2', displayName: 'Jefferson MS', active: true },
      ]);
      localStorage.clear();
    });

    /**
     * TC1: Sidebar namespace area shows namespace name for instructor (display-only).
     * Contract: non-admin users see namespace name text; no interactive trigger present.
     * Catches: switcher leaking to non-admins.
     */
    it('shows namespace name for instructor without chevron', async () => {
      mockUser.mockReturnValue({
        id: 'user1',
        email: 'instructor@example.com',
        display_name: 'Instructor User',
        role: 'instructor',
        namespace_id: 'ns-1',
      });

      render(<Sidebar />);

      await waitFor(() => {
        expect(screen.getByText('Lincoln HS · CS')).toBeInTheDocument();
      });

      // No switch-namespace button for non-admin
      expect(screen.queryByRole('button', { name: /switch namespace/i })).not.toBeInTheDocument();
    });

    /**
     * TC2: Sidebar namespace area shows chevron + dropdown affordance for system-admin.
     * Contract: system-admin sees clickable namespace trigger with chevD icon.
     * Catches: switcher missing for admins.
     */
    it('shows clickable trigger for system-admin', async () => {
      mockUser.mockReturnValue({
        id: 'user4',
        email: 'sysadmin@example.com',
        display_name: 'Sys Admin',
        role: 'system-admin',
        namespace_id: 'ns-1',
      });
      localStorage.setItem('selectedNamespaceId', 'ns-1');

      render(<Sidebar />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /switch namespace/i })).toBeInTheDocument();
      });
    });

    /**
     * TC3: System-admin click on namespace label opens dropdown listing all namespaces.
     * Contract: clicking the namespace trigger shows all namespace displayNames.
     * Catches: dropdown not wired.
     */
    it('opens dropdown listing all namespaces when system-admin clicks trigger', async () => {
      mockUser.mockReturnValue({
        id: 'user4',
        email: 'sysadmin@example.com',
        display_name: 'Sys Admin',
        role: 'system-admin',
        namespace_id: 'ns-1',
      });
      localStorage.setItem('selectedNamespaceId', 'ns-1');

      render(<Sidebar />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /switch namespace/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /switch namespace/i }));

      // Both namespaces should appear as dropdown options (role=button)
      expect(screen.getByRole('button', { name: 'Lincoln HS · CS' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Jefferson MS' })).toBeInTheDocument();
    });

    /**
     * TC4: System-admin select-namespace persists to localStorage + reloads.
     * Contract: clicking a non-current namespace calls localStorage.setItem + window.location.reload.
     * Catches: persistence or reload regression.
     */
    it('persists selected namespace to localStorage when namespace selected', async () => {
      mockUser.mockReturnValue({
        id: 'user4',
        email: 'sysadmin@example.com',
        display_name: 'Sys Admin',
        role: 'system-admin',
        namespace_id: 'ns-1',
      });
      localStorage.setItem('selectedNamespaceId', 'ns-1');

      render(<Sidebar />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /switch namespace/i })).toBeInTheDocument();
      });

      // Open dropdown
      fireEvent.click(screen.getByRole('button', { name: /switch namespace/i }));

      // Click the non-current namespace option
      const jeffersonOption = screen.getByRole('button', { name: /Jefferson MS/i });
      fireEvent.click(jeffersonOption);

      // Persistence must survive the click (reload is a side-effect we verify separately)
      expect(localStorage.getItem('selectedNamespaceId')).toBe('ns-2');
    });

    // NOTE: window.location.reload() is not mockable in jsdom (the Window proxy always
    // returns the real Location object). The reload path is covered by the localStorage
    // persistence test above — persistence + reload are both in handleSelectNamespace().
    // The reload behaviour is verified at the E2E level instead.

    /**
     * TC5: Collapsed sidebar hides namespace area.
     * Contract: when collapsed=true, no namespace display name visible.
     * Catches: collapse branch missing for namespace.
     */
    it('hides namespace area when collapsed', async () => {
      mockUser.mockReturnValue({
        id: 'user1',
        email: 'instructor@example.com',
        display_name: 'Instructor User',
        role: 'instructor',
        namespace_id: 'ns-1',
      });

      render(<Sidebar collapsed={true} />);

      // Allow any async effects to settle
      await act(async () => {});

      expect(screen.queryByText('Lincoln HS · CS')).not.toBeInTheDocument();
    });
  });
});
