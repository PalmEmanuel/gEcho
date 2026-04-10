/**
 * Pure helper: build the ffmpeg `-vf` filter string for a cropped, scaled GIF.
 *
 * AVFoundation captures at physical (Retina) resolution but CoreGraphics reports
 * window bounds in logical points. We scale the crop coordinates up to physical
 * pixels, then scale the output back down so the GIF matches the logical size.
 *
 *   vf = fps=N,crop=pw:ph:px:py,scale=w:h
 *
 * where pw/ph/px/py are the physical (scaled) dimensions and w/h are the logical ones.
 */
export function buildCropFilter(
  bounds: { x: number; y: number; width: number; height: number },
  scaleFactor: number,
  fps: number,
): string {
  const px = Math.round(bounds.x * scaleFactor);
  const py = Math.round(bounds.y * scaleFactor);
  const pw = Math.round(bounds.width * scaleFactor);
  const ph = Math.round(bounds.height * scaleFactor);
  return `fps=${fps},crop=${pw}:${ph}:${px}:${py},scale=${bounds.width}:${bounds.height}`;
}
