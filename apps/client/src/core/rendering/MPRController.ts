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
let crosshairsAdded = false;

export const MPRController = {
  async setup(volumeId: string): Promise<void> {
    const { addTool, ToolGroupManager, Enums: csToolsEnums, CrosshairsTool, ZoomTool, PanTool, WindowLevelTool, StackScrollTool } =
      await import('@cornerstonejs/tools');

    // Register tools globally (idempotent — safe to call multiple times)
    addTool(WindowLevelTool);
    addTool(ZoomTool);
    addTool(PanTool);
    addTool(StackScrollTool);
    addTool(CrosshairsTool);

    const allViewportIds = Object.values(VIEWPORT_IDS);
    toolGroupId = 'webtps-tool-group';

    // Destroy existing tool group if reinitializing
    const existing = ToolGroupManager.getToolGroup(toolGroupId);
    if (existing) ToolGroupManager.destroyToolGroup(toolGroupId);
    crosshairsAdded = false;

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

    // Start with no primary-button image tool selected. The user explicitly chooses
    // Window/Level, Zoom, Pan, or Scroll from the tool rail / shortcuts.
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
    });
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }],
    });
    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary, modifierKey: csToolsEnums.KeyboardBindings.Shift }],
    });
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

    // Deactivate all primary-button tools, then activate the requested one
    // These are the .toolName strings (not class names)
    const tools = ['WindowLevel', 'Zoom', 'Pan', 'StackScroll'];
    for (const t of tools) {
      try { toolGroup.setToolPassive(t); } catch { /* not added */ }
    }
    toolGroup.setToolActive(toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    });
  },

  async clearPrimaryTool(): Promise<void> {
    if (!toolGroupId) return;
    const { ToolGroupManager } = await import('@cornerstonejs/tools');
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) return;

    const tools = ['WindowLevel', 'Zoom', 'Pan', 'StackScroll'];
    for (const t of tools) {
      try { toolGroup.setToolPassive(t); } catch { /* not added */ }
    }
  },

  async enableCrosshairs(): Promise<void> {
    if (!toolGroupId) return;
    const { ToolGroupManager, CrosshairsTool } = await import('@cornerstonejs/tools');
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) return;

    if (!crosshairsAdded) {
      toolGroup.addTool(CrosshairsTool.toolName, {
        getReferenceLineColor: () => 'rgb(0, 200, 255)',
        getReferenceLineControllable: () => true,
        getReferenceLineDraggableRotatable: () => true,
        getReferenceLineSlabThicknessControlsOn: () => false,
      });
      crosshairsAdded = true;
    }

    toolGroup.setToolEnabled(CrosshairsTool.toolName);
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
      crosshairsAdded = false;
    });
  },
};
