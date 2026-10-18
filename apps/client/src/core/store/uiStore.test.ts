import { describe, it, expect, beforeEach } from 'vitest';
import { canEditContours, useUIStore } from './uiStore';
import type { WorkflowStage } from './uiStore';

describe('uiStore - maximize viewport', () => {
  beforeEach(() => {
    useUIStore.setState({
      maximizedViewport: null,
    });
  });

  it('toggleMaximizeViewport sets viewport when null @links:SRS-019 @testing:T1', () => {
    const { toggleMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('AXIAL');

    expect(useUIStore.getState().maximizedViewport).toBe('AXIAL');
  });

  it('toggleMaximizeViewport clears viewport when same @links:SRS-019 @testing:T1', () => {
    const { toggleMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('AXIAL');
    expect(useUIStore.getState().maximizedViewport).toBe('AXIAL');

    toggleMaximizeViewport('AXIAL');
    expect(useUIStore.getState().maximizedViewport).toBeNull();
  });

  it('toggleMaximizeViewport switches viewport @links:SRS-019 @testing:T1', () => {
    const { toggleMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('AXIAL');
    expect(useUIStore.getState().maximizedViewport).toBe('AXIAL');

    toggleMaximizeViewport('SAGITTAL');
    expect(useUIStore.getState().maximizedViewport).toBe('SAGITTAL');
  });

  it('resetMaximizeViewport clears viewport @links:SRS-019 @testing:T2', () => {
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

describe('uiStore - QA stage contour gating', () => {
  beforeEach(() => {
    useUIStore.setState({ workflowStage: 'edit', activeTool: 'none', activeStructureOperationPanel: null });
  });

  it('@links:SRS-037 canEditContours is false only in the QA stage', () => {
    expect(canEditContours('qa')).toBe(false);
    for (const stage of ['auto', 'edit', 'review'] as const) {
      expect(canEditContours(stage)).toBe(true);
    }
  });

  it('@links:SRS-037 @testing:T3 entering QA clears a contour tool and closes the operation panel', () => {
    useUIStore.setState({ activeTool: 'polygon', activeStructureOperationPanel: 'margin' });

    useUIStore.getState().setWorkflowStage('qa');

    expect(useUIStore.getState().activeTool).toBe('none');
    expect(useUIStore.getState().activeStructureOperationPanel).toBeNull();
  });

  it('@links:SRS-037 @testing:T4 entering QA keeps a measurement tool active', () => {
    useUIStore.setState({ activeTool: 'measureDistance' });

    useUIStore.getState().setWorkflowStage('qa');

    expect(useUIStore.getState().activeTool).toBe('measureDistance');
  });
});
