import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ViewportContextMenu from './ViewportContextMenu';

// @links:SRS-018
describe('ViewportContextMenu @links:SRS-018', () => {
  const mockOnMaximize = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnMaximize.mockClear();
    mockOnClose.mockClear();
  });

  // @links:SRS-018
  it('renders with Maximize View when not maximized @testing:T1', () => {
    render(
      <ViewportContextMenu
        orientation="AXIAL"
        isMaximized={false}
        onMaximize={mockOnMaximize}
        x={100}
        y={100}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Maximize View')).toBeTruthy();
  });

  // @links:SRS-018
  it('renders with Restore View when maximized @testing:T2', () => {
    render(
      <ViewportContextMenu
        orientation="AXIAL"
        isMaximized={true}
        onMaximize={mockOnMaximize}
        x={100}
        y={100}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Restore View')).toBeTruthy();
  });

  // @links:SRS-018
  it('calls onMaximize with viewport when Maximize View is clicked @testing:T3', () => {
    render(
      <ViewportContextMenu
        orientation="SAGITTAL"
        isMaximized={false}
        onMaximize={mockOnMaximize}
        x={100}
        y={100}
        onClose={mockOnClose}
      />
    );

    fireEvent.click(screen.getByText('Maximize View'));

    expect(mockOnMaximize).toHaveBeenCalledWith('SAGITTAL');
    expect(mockOnClose).toHaveBeenCalled();
  });

  // @links:SRS-018
  it('calls onMaximize with null when Restore View is clicked @testing:T4', () => {
    render(
      <ViewportContextMenu
        orientation="CORONAL"
        isMaximized={true}
        onMaximize={mockOnMaximize}
        x={100}
        y={100}
        onClose={mockOnClose}
      />
    );

    fireEvent.click(screen.getByText('Restore View'));

    expect(mockOnMaximize).toHaveBeenCalledWith(null);
    expect(mockOnClose).toHaveBeenCalled();
  });

  // @links:SRS-018
  it('closes menu when clicked outside @testing:T5', () => {
    const { container } = render(
      <ViewportContextMenu
        orientation="AXIAL"
        isMaximized={false}
        onMaximize={mockOnMaximize}
        x={100}
        y={100}
        onClose={mockOnClose}
      />
    );

    fireEvent.mouseDown(container);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
