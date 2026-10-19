// Build-time test-deployment flag (docs/GO-LIVE.md "Test deployment on meiyiyal.com"). Only the exact string "true"
// turns it on, so an empty or missing VITE_TEST_MODE in a real production build changes nothing.
export const isTestModeValue = (v: unknown): boolean => String(v ?? "").trim().toLowerCase() === "true";

export const TEST_MODE: boolean = isTestModeValue(import.meta.env?.VITE_TEST_MODE);

export const TEST_MODE_HTML_CLASS = "test-mode";
export const NOINDEX_META = '<meta name="robots" content="noindex, nofollow" />';
export const NOINDEX_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

/** index.html for a test build: a noindex robots meta and the html class (so the page is pushed down before React paints). */
export function testModeHtml(html: string, on: boolean): string {
  if (!on) return html;
  let out = html.includes('name="robots"') ? html : html.replace(/<\/title>/, `</title>\n  ${NOINDEX_META}`);
  out = out.replace(/<html([^>]*)>/, (m, attrs: string) =>
    /class="/.test(attrs) ? m.replace(/class="([^"]*)"/, `class="$1 ${TEST_MODE_HTML_CLASS}"`) : `<html${attrs} class="${TEST_MODE_HTML_CLASS}">`);
  return out;
}
