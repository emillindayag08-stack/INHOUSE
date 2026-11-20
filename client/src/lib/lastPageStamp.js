// Puts an element at the bottom of the last printed page, and only there.
//
// CSS has no "last page" selector (@page :last does not exist), and a fixed or
// margin-box footer repeats on every page. So just before printing, this lays
// the sheet out at the printed width, works out where the browser will break
// the pages, and sets a spacer above the element to fill what is left of the
// last one. The spacer is cleared again after printing.

const MM = 96 / 25.4; // CSS pixels per millimetre, which is how browsers print

// Pieces the browser keeps whole when it breaks pages: anything marked
// .avoid-break, single lines of text, and table rows (a table breaks between
// rows and repeats its header on the next page).
const WHOLE_TAGS = new Set(["TR", "H1", "H2", "H3", "H4", "P", "HEADER", "LI", "IMG", "svg"]);

function pieces(root, skip) {
  const out = [];
  const walk = (el) => {
    for (const child of el.children) {
      if (skip.includes(child) || getComputedStyle(child).display === "none") continue;
      if (child.tagName === "TABLE") {
        const head = child.tHead;
        if (head) out.push({ el: head, head: null });
        for (const row of child.querySelectorAll(":scope > tbody > tr")) out.push({ el: row, head });
      } else if (child.classList.contains("avoid-break") || WHOLE_TAGS.has(child.tagName) || child.children.length === 0) {
        out.push({ el: child, head: null });
      } else {
        walk(child);
      }
    }
  };
  walk(root);
  return out;
}

// sheet: the element that prints as the page body. spacer: an empty block
// directly before `stamp`. page: the printable area in mm (page size less the
// @page margins).
export function placeAtLastPageBottom(sheet, spacer, stamp, page = { width: 265, height: 182 }) {
  if (!sheet || !spacer || !stamp) return;
  spacer.style.height = "0px";

  // Lay the sheet out the way it prints: full printable width, no padding.
  const saved = sheet.getAttribute("style") || "";
  sheet.style.cssText = `${saved};width:${page.width}mm;max-width:none;padding:0;box-shadow:none;margin:0`;
  try {
    const pageHeight = page.height * MM;
    const base = sheet.getBoundingClientRect().top;
    let shift = 0; // how far earlier breaks have pushed everything down
    let pageStart = 0;
    for (const { el, head } of pieces(sheet, [spacer, stamp])) {
      const rect = el.getBoundingClientRect();
      let top = rect.top - base + shift;
      while (top >= pageStart + pageHeight) pageStart += pageHeight;
      if (top + rect.height > pageStart + pageHeight && rect.height <= pageHeight) {
        // Doesn't fit: the browser moves it to the next page, after the
        // repeated table header if it is a table row.
        const moved = pageStart + pageHeight + (head ? head.getBoundingClientRect().height : 0);
        shift += moved - top;
        top = moved;
        pageStart += pageHeight;
      }
    }

    const stampRect = stamp.getBoundingClientRect();
    const stampTop = stampRect.top - base + shift;
    // A little slack for rounding, so the stamp never spills onto a new page.
    const room = pageStart + pageHeight - stampTop - stampRect.height - 12;
    spacer.style.height = room > 0 && stampTop >= pageStart ? `${Math.floor(room)}px` : "0px";
  } finally {
    sheet.setAttribute("style", saved);
  }
}

export function clearLastPageSpacer(spacer) {
  if (spacer) spacer.style.height = "0px";
}
