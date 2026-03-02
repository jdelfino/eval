/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, act } from '@testing-library/react';

const mockReportError = jest.fn();

jest.mock('@/lib/api/error-reporting', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import { ErrorListener } from '../ErrorListener';

describe('ErrorListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing visible', () => {
    const { container } = render(<ErrorListener />);
    expect(container.firstChild).toBeNull();
  });

  it('calls reportError when window error event fires', async () => {
    mockReportError.mockResolvedValue(undefined);
    render(<ErrorListener />);

    const error = new Error('Uncaught error');
    await act(async () => {
      window.dispatchEvent(new ErrorEvent('error', { error, message: 'Uncaught error' }));
    });

    expect(mockReportError).toHaveBeenCalledWith(error, expect.any(Object));
  });

  it('calls reportError when unhandledrejection event fires', async () => {
    mockReportError.mockResolvedValue(undefined);
    render(<ErrorListener />);

    const error = new Error('Promise rejection');
    // PromiseRejectionEvent may not be available in jsdom; use a plain Event with reason property
    const event = Object.assign(new Event('unhandledrejection'), { reason: error });

    await act(async () => {
      window.dispatchEvent(event);
    });

    expect(mockReportError).toHaveBeenCalledWith(error, expect.any(Object));
  });

  it('handles non-Error rejection reason gracefully', async () => {
    mockReportError.mockResolvedValue(undefined);
    render(<ErrorListener />);

    const event = Object.assign(new Event('unhandledrejection'), { reason: 'string rejection' });

    await act(async () => {
      window.dispatchEvent(event);
    });

    expect(mockReportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.any(Object)
    );
  });

  it('removes event listeners on unmount', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = render(<ErrorListener />);

    const addedListeners = addSpy.mock.calls.map((c) => c[0]);
    expect(addedListeners).toContain('error');
    expect(addedListeners).toContain('unhandledrejection');

    unmount();

    const removedListeners = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedListeners).toContain('error');
    expect(removedListeners).toContain('unhandledrejection');

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
