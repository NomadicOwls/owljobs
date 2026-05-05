export function setCacheHeaders(
  headers: Headers,
  sMaxAge: number,
  staleWhileRevalidate = 0,
): void {
  const parts = [`public`, `s-maxage=${sMaxAge}`];
  if (staleWhileRevalidate > 0) {
    parts.push(`stale-while-revalidate=${staleWhileRevalidate}`);
  }
  headers.set("Cache-Control", parts.join(", "));
}
