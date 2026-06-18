import * as React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../Modal';

describe('Modal', () => {
  afterEach(() => {
    // Ensure scroll lock never leaks between tests.
    document.body.style.overflow = '';
  });

  /**
   * Test case 1: Renders title/sub/children/footer when open; nothing when
   * closed. Verifies the open-gating contract — the whole rest of G7 mounts
   * modals conditionally on `open`. If violated, modals would render while
   * closed (or never render content).
   */
  it('renders title, sub, children and footer when open', () => {
    render(
      <Modal
        open
        title="My Modal"
        sub="a subtitle"
        footer={<button>Save</button>}
        onClose={jest.fn()}
      >
        <p>body content</p>
      </Modal>
    );
    expect(screen.getByRole('heading', { name: 'My Modal' })).toBeInTheDocument();
    expect(screen.getByText('a subtitle')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('renders nothing when not open', () => {
    render(
      <Modal open={false} title="Hidden" onClose={jest.fn()}>
        <p>nope</p>
      </Modal>
    );
    expect(screen.queryByRole('heading', { name: 'Hidden' })).not.toBeInTheDocument();
    expect(screen.queryByText('nope')).not.toBeInTheDocument();
  });

  /**
   * Test case 1 (portal): content mounts under document.body, not inside the
   * React render container. Downstream modals overlay app chrome and must
   * escape any clipping/stacking parent.
   */
  it('renders content through a portal on document.body', () => {
    const { container } = render(
      <Modal open title="Portaled" onClose={jest.fn()}>
        <p>portaled body</p>
      </Modal>
    );
    expect(container).not.toHaveTextContent('portaled body');
    expect(document.body).toHaveTextContent('portaled body');
  });

  /**
   * Test case 2: Escape and backdrop click each call onClose; clicking inside
   * the panel does NOT. Verifies dismiss wiring that every modal relies on
   * (and that ConfirmDialog's rebuild in T2 inherits).
   */
  it('calls onClose on Escape', () => {
    const onClose = jest.fn();
    render(
      <Modal open title="Esc" onClose={onClose}>
        <p>body</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on backdrop click but not on panel click', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <Modal
        open
        title="Backdrop"
        onClose={onClose}
        backdropTestId="modal-backdrop"
        contentTestId="modal-content"
      >
        <p>inside panel</p>
      </Modal>
    );

    await user.click(screen.getByText('inside panel'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * Test case 3: On open focus moves into the dialog; on close focus restores
   * to the previously-focused element; body scroll is locked while open and
   * restored on close. This focus-trap/scroll-lock contract is exactly what
   * T2's ConfirmDialog rebuild depends on.
   */
  it('moves focus into the dialog on open and restores it on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(
      <Modal open title="Focus" onClose={jest.fn()}>
        <p>body</p>
      </Modal>
    );

    // Focus moves into the dialog (the timeout-based focus must run).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    rerender(
      <Modal open={false} title="Focus" onClose={jest.fn()}>
        <p>body</p>
      </Modal>
    );
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });

  it('locks body scroll while open and restores on close', () => {
    const { rerender } = render(
      <Modal open title="Scroll" onClose={jest.fn()}>
        <p>body</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Modal open={false} title="Scroll" onClose={jest.fn()}>
        <p>body</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe('');
  });

  /**
   * Test case 4: role/aria-modal/aria-labelledby present and the labelledby id
   * points at the heading title node. Verifies a11y plumbing and that the
   * title is a real heading (plan-review amendment M1) so downstream
   * getByRole('heading') queries survive.
   */
  it('exposes dialog role, aria-modal, and aria-labelledby pointing at the heading title', () => {
    render(
      <Modal open title="Labelled" onClose={jest.fn()}>
        <p>body</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    const heading = screen.getByRole('heading', { name: 'Labelled' });
    expect(heading.id).toBe(labelledBy);
  });

  it('allows overriding the role', () => {
    render(
      <Modal open title="Override" role="dialog" contentTestId="solution-viewer-modal" onClose={jest.fn()}>
        <p>body</p>
      </Modal>
    );
    expect(screen.getByTestId('solution-viewer-modal')).toBeInTheDocument();
  });

  /**
   * Test case 4 (tone): tone prop renders the matching tone icon chip with the
   * tone's soft background. Catches tone-map drift in the header badge.
   */
  it('renders a tone icon chip with the matching soft background', () => {
    const { container } = render(
      <Modal open title="Toned" tone="danger" onClose={jest.fn()}>
        <p>body</p>
      </Modal>
    );
    // The chip is the only element with the danger-soft background.
    const chip = Array.from(container.ownerDocument.querySelectorAll<HTMLElement>('div')).find(
      (el) => el.style.background === 'var(--danger-soft)'
    );
    expect(chip).toBeTruthy();
    expect(chip!.style.color).toBe('var(--danger)');
  });

  it('renders no tone chip when tone is omitted', () => {
    const { baseElement } = render(
      <Modal open title="No tone" onClose={jest.fn()}>
        <p>body</p>
      </Modal>
    );
    const chip = Array.from(baseElement.querySelectorAll<HTMLElement>('div')).find((el) =>
      /-soft\)$/.test(el.style.background)
    );
    expect(chip).toBeUndefined();
  });

  /**
   * Test case 5: testid props land on backdrop/content nodes. Silent breakage
   * here would break T3/T5 selector preservation (modal-backdrop /
   * modal-content / solution-viewer-modal).
   */
  it('applies backdropTestId and contentTestId to the backdrop and content nodes', () => {
    render(
      <Modal
        open
        title="Testids"
        onClose={jest.fn()}
        backdropTestId="modal-backdrop"
        contentTestId="modal-content"
      >
        <p>body</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-backdrop')).toBeInTheDocument();
    expect(screen.getByTestId('modal-content')).toBeInTheDocument();
    // Content node is the dialog panel, not the backdrop.
    expect(screen.getByTestId('modal-content')).toContainElement(screen.getByText('body'));
  });

  it('does not render a footer region when no footer is provided', () => {
    render(
      <Modal open title="No footer" onClose={jest.fn()}>
        <p>body</p>
      </Modal>
    );
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
