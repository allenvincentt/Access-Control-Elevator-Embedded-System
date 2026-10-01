export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function rectArea(box: Rect): number {
  return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
}

export function overlapArea(a: Rect, b: Rect): number {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);

  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

export function intersectionOverUnion(a: Rect, b: Rect): number {
  const overlap = overlapArea(a, b);
  if (overlap <= 0) return 0;

  const union = rectArea(a) + rectArea(b) - overlap;
  return union > 0 ? overlap / union : 0;
}

export function intersectionOverSmaller(a: Rect, b: Rect): number {
  const overlap = overlapArea(a, b);
  if (overlap <= 0) return 0;

  const smaller = Math.min(rectArea(a), rectArea(b));
  return smaller > 0 ? overlap / smaller : 0;
}

export function unionRect(a: Rect, b: Rect): Rect {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}
