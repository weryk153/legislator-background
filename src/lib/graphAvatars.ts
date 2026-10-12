/** Overview dots do not need portraits; fetch only when large enough to read and on canvas. */
export function shouldLoadGraphAvatar(position: { x: number; y: number }, size: number,
  viewport: { width: number; height: number }, visible = true): boolean {
  const radius = size / 2;
  return visible && size >= 18 && position.x + radius >= 0 && position.y + radius >= 0
    && position.x - radius <= viewport.width && position.y - radius <= viewport.height;
}
