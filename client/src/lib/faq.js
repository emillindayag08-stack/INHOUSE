// KODI's frequently asked questions. They live on the server (GET /api/faq)
// and the Secretariat edits them on the FAQs page. Keep the answers in step
// with PROCESS_FLOW.md.

// The roles a question can be limited to, in the order the editor lists them.
// A question limited to none is for everyone.
export const FAQ_ROLES = [
  { value: "PARTY", label: "University members" },
  { value: "SECRETARIAT", label: "Secretariat" },
  { value: "CHAIRPERSON", label: "Chairperson" },
  { value: "COMMITTEE", label: "Committee" },
  { value: "DISCIPLINING_AUTHORITY", label: "Disciplining Authority" },
];

// The server sends a flat, ordered list; a section is a run of entries with the
// same title. Returns [{ title, items: [entry, …] }, …] in that order.
export function groupFaq(entries) {
  const sections = [];
  for (const entry of entries || []) {
    const last = sections[sections.length - 1];
    if (last && last.title === entry.section) last.items.push(entry);
    else sections.push({ title: entry.section, items: [entry] });
  }
  return sections;
}
