// Removes XSS vectors from ATS-sourced HTML before storing in jobs.description.
// Regex-based allowlist — avoids external deps that may not work under workerd.
export function sanitizeJobDescription(html: string): string {
  return html
    // Strip dangerous block elements entirely (tags + their content)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    // Strip event handler attributes
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    // Neutralise javascript: hrefs
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
    // Collapse runs of empty paragraphs Workday emits
    .replace(/(<p[^>]*>\s*<\/p>\s*){3,}/g, "")
    .trim();
}
