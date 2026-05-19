import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';
import type { WorkflowStage } from './uiStore';

describe('uiStore - maximize viewport', () => {
  beforeEach(() => {
    useUIStore.setState({
      maximizedViewport: null,
    });
  });

  // @links:SRS-019
  it('toggleMaximizeViewport sets viewport when null', () => {
    const { toggleMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('AXIAL');

    expect(useUIStore.getState().maximizedViewport).toBe('AXIAL');
  });

  // @links:SRS-019
  it('toggleMaximizeViewport clears viewport when same', () => {
    const { toggleMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('AXIAL');
    expect(useUIStore.getState().maximizedViewport).toBe('AXIAL');

    toggleMaximizeViewport('AXIAL');
    expect(useUIStore.getState().maximizedViewport).toBeNull();
  });

  // @links:SRS-019
  it('toggleMaximizeViewport switches viewport', () => {
    const { toggleMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('AXIAL');
    expect(useUIStore.getState().maximizedViewport).toBe('AXIAL');

    toggleMaximizeViewport('SAGITTAL');
    expect(useUIStore.getState().maximizedViewport).toBe('SAGITTAL');
  });

  // @links:SRS-019
  it('resetMaximizeViewport clears viewport', () => {
    const { toggleMaximizeViewport, resetMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('CORONAL');
    expect(useUIStore.getState().maximizedViewport).toBe('CORONAL');

    resetMaximizeViewport();
    expect(useUIStore.getState().maximizedViewport).toBeNull();
  });
});

describe('uiStore - workflow stage and side panel tab', () => {
  beforeEach(() => {
    useUIStore.setState({
      workflowStage: 'edit',
      sidePanelTab: 'structures',
    });
  });

  it('setWorkflowStage updates workflowStage', () => {
    useUIStore.getState().setWorkflowStage('qa');
    expect(useUIStore.getState().workflowStage).toBe('qa');
  });

  it.each<[WorkflowStage, string]>([
    ['auto',    'ai'],
    ['edit',    'structures'],
    ['qa',      'qa'],
    ['review',  'review'],
    ['approve', 'review'],
  ])('setWorkflowStage(%s) co-updates sidePanelTab to %s', (stage, expectedTab) => {
    useUIStore.getState().setWorkflowStage(stage);
    expect(useUIStore.getState().sidePanelTab).toBe(expectedTab);
  });

  it('setSidePanelTab updates sidePanelTab without touching workflowStage', () => {
    useUIStore.getState().setSidePanelTab('audit');
    expect(useUIStore.getState().sidePanelTab).toBe('audit');
    expect(useUIStore.getState().workflowStage).toBe('edit');
  });

  it('setSidePanelTab can be set to each valid tab', () => {
    for (const tab of ['structures', 'ai', 'qa', 'review', 'audit'] as const) {
      useUIStore.getState().setSidePanelTab(tab);
      expect(useUIStore.getState().sidePanelTab).toBe(tab);
    }
  });
});
