import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { groupFaq } from "../lib/faq.js";
import { ChevronDownIcon, SearchIcon, XIcon } from "./icons.jsx";

const AVATAR = "/assistant/kodi-96.png";
const AVATAR_LARGE = "/assistant/kodi-256.png";

// KODI's face: the avatar on a soft round backdrop (the image is transparent).
function Kodi({ size = "h-8 w-8", src = AVATAR, className = "" }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`${size} shrink-0 rounded-full bg-gradient-to-b from-amber-50 to-rose-100 object-cover ${className}`}
    />
  );
}

// KODI, the help bubble on every signed-in page: frequently asked questions
// for the signed-in role, with a search. Whether it is open survives moving
// between pages (each page mounts its own Layout) but not a refresh. The
// questions come from the server, which the Secretariat edits on the FAQs
// page; they are fetched again each time KODI opens, so an edit shows up
// without signing out.
let saved = { userId: null, open: false, entries: null };

export default function KodiFaq() {
  const { user } = useAuth();
  if (saved.userId !== user.id) saved = { userId: user.id, open: false, entries: null };

  const [open, setOpen] = useState(saved.open);
  const [entries, setEntries] = useState(saved.entries);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api
      .get("/faq")
      .then((res) => {
        if (!live) return;
        saved = { ...saved, entries: res.data };
        setEntries(res.data);
        setLoadFailed(false);
      })
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [open]);

  const sections = useMemo(() => groupFaq(entries), [entries]);
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter((item) => {
          const text = `${item.question} ${item.answer.join(" ")}`.toLowerCase();
          return words.every((w) => text.includes(w));
        }),
      }))
      .filter((s) => s.items.length > 0);
  }, [sections, query]);

  useEffect(() => {
    saved = { ...saved, open };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="KODI, frequently asked questions"
          className="fixed inset-x-3 bottom-20 z-40 flex max-h-[min(36rem,calc(100dvh-7rem))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:w-96"
        >
          <div className="flex items-start justify-between gap-3 bg-maroon px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <Kodi size="h-10 w-10" className="ring-2 ring-white/70" />
              <div>
                <p className="text-sm font-semibold">KODI</p>
                <p className="text-xs text-white/75">Frequently asked questions</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close KODI"
              className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-neutral-100 p-3">
            <label className="relative block">
              <span className="sr-only">Search the questions</span>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setExpanded(null);
                }}
                placeholder="Search, e.g. deadline, notarized, prima facie"
                className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
              />
            </label>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
            {!query && (
              <div className="mb-3 flex items-center gap-3">
                <Kodi size="h-14 w-14" src={AVATAR_LARGE} className="shadow-sm" />
                <div>
                  <p className="font-semibold text-neutral-800">Hi {user.fullName?.split(" ")[0]}, I'm KODI!</p>
                  <p className="text-neutral-600">Here are answers to common questions. Tap one to read it.</p>
                </div>
              </div>
            )}

            {entries === null ? (
              <p className="rounded-lg bg-neutral-50 px-3 py-4 text-center text-neutral-500">
                {loadFailed ? "The questions could not be loaded. Close KODI and try again." : "Loading the questions…"}
              </p>
            ) : (
              shown.length === 0 && (
                <p className="rounded-lg bg-neutral-50 px-3 py-4 text-center text-neutral-500">
                  {query ? `No questions match “${query}”.` : "There are no questions yet."}
                </p>
              )
            )}

            {shown.map((section) => (
              <section key={section.title} className="mb-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{section.title}</h3>
                <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                  {section.items.map((item) => {
                    const isOpen = expanded === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : item.id)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left font-medium text-neutral-800 hover:bg-neutral-50"
                        >
                          {item.question}
                          <ChevronDownIcon
                            className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        {isOpen && (
                          <div className="flex items-start gap-2 px-3 pb-3">
                            <Kodi size="h-7 w-7" />
                            <div className="space-y-1.5 rounded-2xl bg-neutral-100 px-3 py-2 text-neutral-700">
                              {item.answer.map((line, i) => (
                                <p key={i}>{line}</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <p className="border-t border-neutral-100 px-4 py-2.5 text-xs text-neutral-500">
            Didn't find your answer? Contact the CODI Secretariat.
          </p>
        </div>
      )}

      {open ? (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close KODI"
          title="Close KODI"
          aria-expanded={open}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-maroon text-white shadow-lg transition hover:scale-105 hover:bg-maroon-light sm:right-6"
        >
          <XIcon className="h-5 w-5" />
        </button>
      ) : (
        // A labelled pill, so it reads as help rather than a profile picture.
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open KODI, frequently asked questions"
          title="Frequently asked questions"
          aria-expanded={open}
          className="group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-maroon py-1.5 pl-1.5 pr-4 text-white shadow-lg ring-2 ring-white transition hover:scale-105 hover:bg-maroon-light sm:right-6"
        >
          <span className="relative">
            <Kodi size="h-11 w-11" src={AVATAR_LARGE} className="ring-2 ring-white" />
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-maroon ring-2 ring-white"
            >
              ?
            </span>
          </span>
          <span className="text-left leading-tight">
            <span className="block text-sm font-semibold">FAQs</span>
            <span className="hidden text-[11px] text-white/80 sm:block">Questions? Ask KODI</span>
          </span>
        </button>
      )}
    </>
  );
}
