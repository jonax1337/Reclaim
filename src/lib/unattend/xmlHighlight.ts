/**
 * Tiny XML syntax highlighter — produces HTML with class-only styling so the
 * consuming component can theme via Tailwind tokens. Matches the convention
 * used by Chrome's view-source and Firefox's pretty-print XML viewer:
 * tags purple, attribute names red/orange, values blue, comments green/gray,
 * declarations magenta.
 *
 * Pure string-in / HTML-out; safe against XSS because the input is escaped
 * BEFORE the tokenizer runs, so any literal `<` in attribute values stays
 * an entity in the output.
 */
export function highlightXml(xml: string): string {
  // Step 1: HTML-escape everything. After this, the tokenizer works on the
  // ESCAPED form (`&lt;tag&gt;`) and inserts `<span>` wrappers that the
  // browser will render as actual tags.
  let s = xml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Step 2: Comments first — they can contain anything, including text that
  // would otherwise look like a tag.
  s = s.replace(/&lt;!--[\s\S]*?--&gt;/g, (m) => `<span class="xml-comment">${m}</span>`);

  // Step 3: CDATA sections.
  s = s.replace(/&lt;!\[CDATA\[[\s\S]*?\]\]&gt;/g, (m) => `<span class="xml-cdata">${m}</span>`);

  // Step 4: XML declaration and processing instructions (<?xml ... ?>).
  s = s.replace(/&lt;\?[\s\S]*?\?&gt;/g, (m) => `<span class="xml-pi">${m}</span>`);

  // Step 5: DOCTYPE.
  s = s.replace(/&lt;!DOCTYPE[\s\S]*?&gt;/g, (m) => `<span class="xml-doctype">${m}</span>`);

  // Step 6: Element tags with optional attributes. Captures:
  //   group 1: leading slash for close tags
  //   group 2: tag name (allows :, ., -, _)
  //   group 3: attribute soup (everything between tag name and closing >)
  //   group 4: optional self-closing slash
  s = s.replace(
    /&lt;(\/?)([\w:.\-]+)((?:\s+[\w:.\-]+\s*=\s*(?:&quot;[^&]*?&quot;|&#39;[^&]*?&#39;))*)\s*(\/?)&gt;/g,
    (_full, slash, tag, attrs, selfclose) => {
      let html = `<span class="xml-bracket">&lt;${slash}</span><span class="xml-tag">${tag}</span>`;
      if (attrs) {
        // Highlight each `name="value"` pair. Values may be double- or
        // single-quoted; both come through as escaped entities by now.
        html += attrs.replace(
          /(\s+)([\w:.\-]+)(\s*=\s*)(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g,
          (
            _m: string,
            ws: string,
            name: string,
            eq: string,
            value: string,
          ) =>
            `${ws}<span class="xml-attr">${name}</span><span class="xml-eq">${eq}</span><span class="xml-value">${value}</span>`,
        );
      }
      html += `<span class="xml-bracket">${selfclose}&gt;</span>`;
      return html;
    },
  );

  return s;
}
