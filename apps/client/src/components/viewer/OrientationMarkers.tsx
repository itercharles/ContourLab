import { useEffect, useState } from 'react';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import {
  isVec3,
  orientationLabels,
  type OrientationLabels,
} from '../../core/rendering/orientationMarkers';

interface CameraSource {
  getCamera?: () => { viewUp?: unknown; viewPlaneNormal?: unknown };
}

function readLabels(viewportId: string): OrientationLabels | null {
  const viewport = ViewportManager.getRenderingEngine()?.getViewport(viewportId) as CameraSource | undefined;
  const camera = viewport?.getCamera?.();
  if (!camera || !isVec3(camera.viewUp) || !isVec3(camera.viewPlaneNormal)) return null;
  return orientationLabels({ viewUp: camera.viewUp, viewPlaneNormal: camera.viewPlaneNormal });
}

function same(a: OrientationLabels | null, b: OrientationLabels | null): boolean {
  return a === b || (!!a && !!b && a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom);
}

interface OrientationMarkersProps {
  viewportId: string;
  viewportElement: HTMLDivElement | null;
  /** DICOM Patient Position (0018,5100) of the displayed series, for example HFS. */
  patientPosition?: string;
}

const MARKER_CLASS =
  'absolute rounded bg-black/50 px-1 text-[12px] font-mono font-semibold leading-4 text-amber-200';

// R/L/A/P/S/I letters on the four edges of a 2D view, read from the viewport camera, plus the
// patient position. If the camera cannot be read nothing is drawn: a missing marker is better than a
// wrong one, because the point of the markers is to tell left from right.
export default function OrientationMarkers({ viewportId, viewportElement, patientPosition }: OrientationMarkersProps) {
  const [labels, setLabels] = useState<OrientationLabels | null>(null);

  useEffect(() => {
    const update = () => {
      const next = readLabels(viewportId);
      setLabels((previous) => (same(previous, next) ? previous : next));
    };

    update();
    if (!viewportElement) return;

    // A render follows every change of camera, plane or loaded volume; the camera event covers
    // changes that do not render at once.
    viewportElement.addEventListener('CORNERSTONE_IMAGE_RENDERED', update);
    viewportElement.addEventListener('CORNERSTONE_CAMERA_MODIFIED', update);
    return () => {
      viewportElement.removeEventListener('CORNERSTONE_IMAGE_RENDERED', update);
      viewportElement.removeEventListener('CORNERSTONE_CAMERA_MODIFIED', update);
    };
  }, [viewportId, viewportElement]);

  if (!labels) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none" role="group" aria-label="Patient orientation">
      <span data-orientation="top" className={`${MARKER_CLASS} left-1/2 top-1 -translate-x-1/2`}>{labels.top}</span>
      <span data-orientation="bottom" className={`${MARKER_CLASS} bottom-1 left-1/2 -translate-x-1/2`}>{labels.bottom}</span>
      <span data-orientation="left" className={`${MARKER_CLASS} left-1 top-1/2 -translate-y-1/2`}>{labels.left}</span>
      <span data-orientation="right" className={`${MARKER_CLASS} right-1 top-1/2 -translate-y-1/2`}>{labels.right}</span>
      {patientPosition && (
        <span data-orientation="position" className={`${MARKER_CLASS} bottom-1 left-1`} title="Patient position">
          {patientPosition}
        </span>
      )}
    </div>
  );
}
