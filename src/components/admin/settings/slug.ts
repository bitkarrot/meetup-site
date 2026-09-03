/**
 * Convert a page title into a URL-friendly slug.
 * e.g. "About Us" -> "/about-us", "FAQ & Help!" -> "/faq-help"
 */
export function titleToSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove non-word chars (except spaces and hyphens)
    .replace(/[\s_]+/g, '-') // replace spaces/underscores with hyphens
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
  return slug ? `/${slug}` : '';
}
