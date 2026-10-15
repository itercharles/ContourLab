import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ContourErrorBoundary from './ContourErrorBoundary';

let broken = true;
function Overlay() {
  if (broken) throw new Error('boom');
  return <div data-testid="overlay">contours</div>;
}

describe('ContourErrorBoundary @links:SYS-002', () => {
  beforeEach(() => {
    broken = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the overlay when nothing fails @testing:T7', () => {
    broken = false;
    render(<ContourErrorBoundary label="AXIAL"><Overlay /></ContourErrorBoundary>);
    expect(screen.getByTestId('overlay')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says contours are hidden, and in which view, instead of showing nothing @testing:T7', () => {
    render(<ContourErrorBoundary label="CORONAL"><Overlay /></ContourErrorBoundary>);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('coronal view');
    expect(alert.textContent).toContain('hidden');
    expect(screen.queryByTestId('overlay')).toBeNull();
  });

  it('recovers when Retry is pressed and the overlay works again @testing:T7', () => {
    render(<ContourErrorBoundary label="AXIAL"><Overlay /></ContourErrorBoundary>);
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByTestId('overlay')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps showing the message if the overlay fails again after Retry @testing:T7', () => {
    render(<ContourErrorBoundary label="AXIAL"><Overlay /></ContourErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
