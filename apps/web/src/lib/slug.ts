export function slugFromId(id: string): string {
  return id.slice(0, 12);
}

export function prefixFromSlug(slug: string): string {
  return slug.slice(0, 12);
}
