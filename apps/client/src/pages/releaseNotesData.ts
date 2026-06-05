import { version } from '../../package.json';

export interface ReleaseEntry {
  version: string;
  date: string;
  changes: string[];
}

export const RELEASE_NOTES: ReleaseEntry[] = [
  {
    version,
    date: '2026-06-05',
    changes: [
      'Added dedicated release notes page accessible from the sidebar system footer',
      'Added navigation icon in the left sidebar system footer row for release notes',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-05-01',
    changes: [
      'Initial release of ContourLab',
      'DICOM repository browser with patient/series worklist',
      'Multi-viewport image display with Cornerstone3D rendering',
      'RTSTRUCT import, structure list, and per-structure visibility toggles',
      'Real-time collaborative contour editing over WebSocket',
      'Issues and change request tracking page',
      'Settings page with display and preference controls',
    ],
  },
];
