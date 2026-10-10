import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ToolOptions from './ToolOptions';
import { useUIStore } from '../../core/store/uiStore';

beforeEach(() => {
  useUIStore.setState({
    activeTool: 'windowLevel',
    windowLevelPreset: 'softTissue',
    brushRadius: 10,
  });
});

describe('ToolOptions', () => {
  it('shows window level presets and updates the active preset', () => {
    render(<ToolOptions />);

    expect(screen.getByRole('toolbar', { name: 'Window level options' })).toBeTruthy();
    expect(screen.getByText('W 400 · L 40')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Lung' }));

    expect(useUIStore.getState().windowLevelPreset).toBe('lung');
    expect(screen.getByText('W 1500 · L -600')).toBeTruthy();
  });

  it('shows brush secondary controls and updates brush size', () => {
    useUIStore.setState({ activeTool: 'brush', brushRadius: 8 });

    render(<ToolOptions />);

    expect(screen.getByRole('toolbar', { name: 'Brush options' })).toBeTruthy();
    expect(screen.getByText('Circle')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Brush size'), { target: { value: '18' } });

    expect(useUIStore.getState().brushRadius).toBe(18);
    expect(screen.getByText('18px')).toBeTruthy();
  });

  it('shows contour mode options for polygon tools', () => {
    useUIStore.setState({ activeTool: 'polygon' });

    render(<ToolOptions />);

    expect(screen.getByRole('toolbar', { name: 'Polygon options' })).toBeTruthy();
    expect(screen.getByText('New contour')).toBeTruthy();
    expect(screen.getByText('Close on click start')).toBeTruthy();
  });
});
