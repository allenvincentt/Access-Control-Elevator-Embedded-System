export type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type Detection = Box & { score: number };

export function iou(a: Box, b: Box): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) return 0;
  const overlap = width * height;
  const union =
    (a.right - a.left) * (a.bottom - a.top) + (b.right - b.left) * (b.bottom - b.top) - overlap;
  return union > 0 ? overlap / union : 0;
}
