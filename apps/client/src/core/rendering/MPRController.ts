/**
 * MPRController: sets up crosshair synchronization between
 * AXIAL, SAGITTAL, and CORONAL viewports using Cornerstone3D tools.
 */

export const VIEWPORT_IDS = {
  AXIAL: 'viewport-axial',
  SAGITTAL: 'viewport-sagittal',
  CORONAL: 'viewport-coronal',
} as const;

let toolGroupId: string | null = null;

export const MPRController = {
  async setup(volumeId: string): Promise<void> {
    const { ToolGroupManager, Enums: csToolsEnums, CrosshairsTool, ZoomTool, PanTool, WindowLevelTool, StackScrollTool } =
      await import('@cornerstonejs/tools');

    const allViewportIds = Object.values(VIEWPORT_IDS);
    toolGroupId = 'webtps-tool-group';

    // Destroy existing tool group if reinitializing
    const existing = ToolGroupManager.getToolGroup(toolGroupId);
    if (existing) ToolGroupManager.destroyToolGroup(toolGroupId);

    const toolGroup = ToolGroupManager.createToolGroup(toolGroupId)!;

    // Add all viewports to the tool group
    for (const vpId of allViewportIds) {
      toolGroup.addViewport(vpId, 'webtps-rendering-engine');
    }

    // Add tools
    toolGroup.addTool(WindowLevelTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName);
    toolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor: () => 'rgb(0, 200, 255)',
      getReferenceLineControllable: () => true,
      getReferenceLineDraggableRotatable: () => true,
      getReferenceLineSlabThicknessControlsOn: () => false,
    });

    // Set defaults: WindowLevel on left mouse, Zoom on right, Pan on middle
    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    });
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
    });
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }],
    });
    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary, modifierKey: csToolsEnums.KeyboardBindings.Shift }],
    });
    toolGroup.setToolEnabled(CrosshairsTool.toolName);

    void volumeId; // volume association happens via setVolume in ViewportManager
  },

  getToolGroupId(): string | null {
    return toolGroupId;
  },

  async setActiveTool(toolName: string): Promise<void> {
    if (!toolGroupId) return;
    const { ToolGroupManager, Enums: csToolsEnums } = await import('@cornerstonejs/tools');
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) return;

    // Deactivate all tools, then activate the requested one
    const tools = [
      'WindowLevelTool', 'ZoomTool', 'PanTool', 'StackScrollTool',
      'FreehandRoiTool', 'BrushTool',
    ];
    for (const t of tools) {
      try { toolGroup.setToolPassive(t); } catch { /* not added */ }
    }
    toolGroup.setToolActive(toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    });
  },

  async enableCrosshairs(): Promise<void> {
    if (!toolGroupId) return;
    const { ToolGroupManager, CrosshairsTool } = await import('@cornerstonejs/tools');
    ToolGroupManager.getToolGroup(toolGroupId)?.setToolEnabled(CrosshairsTool.toolName);
  },

  async disableCrosshairs(): Promise<void> {
    if (!toolGroupId) return;
    const { ToolGroupManager, CrosshairsTool } = await import('@cornerstonejs/tools');
    ToolGroupManager.getToolGroup(toolGroupId)?.setToolDisabled(CrosshairsTool.toolName);
  },

  destroy(): void {
    if (!toolGroupId) return;
    import('@cornerstonejs/tools').then(({ ToolGroupManager }) => {
      ToolGroupManager.destroyToolGroup(toolGroupId!);
      toolGroupId = null;
    });
  },
};
