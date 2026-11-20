import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import { ChevronDownIcon, PlusIcon } from "../components/icons.jsx";
import { FAQ_ROLES, groupFaq } from "../lib/faq.js";

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon";
const smallButton =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

const ROLE_LABEL = Object.fromEntries(FAQ_ROLES.map((r) => [r.value, r.label]));

// Keys for React only; the server assigns ids when the list is saved.
let nextKey = 1;
const newKey = () => `k${nextKey++}`;

function toDraft(entries) {
  return groupFaq(entries).map((section) => ({
    key: newKey(),
    title: section.title,
    items: section.items.map((item) => ({
      key: newKey(),
      question: item.question,
      answer: item.answer.join("\n"),
      roles: item.roles,
    })),
  }));
}

// What is sent, and what "unsaved changes" is measured against.
function toEntries(sections) {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      section: section.title.trim(),
      question: item.question.trim(),
      answer: item.answer.split("\n").map((line) => line.trim()).filter(Boolean),
      roles: FAQ_ROLES.map((r) => r.value).filter((r) => item.roles.includes(r)),
    }))
  );
}

// Problems worth catching before the round trip. The server checks again.
function problemIn(sections) {
  const titles = new Set();
  for (const section of sections) {
    const title = section.title.trim();
    if (!title) return "Every section needs a title.";
    if (titles.has(title.toLowerCase())) return `There are two sections called “${title}”. Merge them or rename one.`;
    titles.add(title.toLowerCase());
    for (const item of section.items) {
      if (!item.question.trim()) return `A question in “${title}” is empty.`;
      if (!item.answer.trim()) return `“${item.question.trim()}” needs an answer.`;
    }
  }
  return "";
}

function move(list, index, by) {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

// The Secretariat's page for KODI's frequently asked questions: change the
// wording, add and remove questions, order them, and choose who sees each one.
// The whole list is saved at once.
export default function FaqEditorPage() {
  const { user } = useAuth();
  const [sections, setSections] = useState(null);
  const [savedJson, setSavedJson] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const loadInto = useCallback((entries) => {
    const draft = toDraft(entries);
    setSections(draft);
    setSavedJson(JSON.stringify(toEntries(draft)));
  }, []);

  useEffect(() => {
    if (user.role !== "SECRETARIAT") return;
    api
      .get("/faq/all")
      .then((res) => loadInto(res.data))
      .catch((err) => setError(err.response?.data?.error || "Failed to load the FAQs"));
  }, [loadInto, user.role]);

  const dirty = useMemo(() => sections !== null && JSON.stringify(toEntries(sections)) !== savedJson, [sections, savedJson]);

  // Leaving with unsaved edits loses them, so the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (user.role !== "SECRETARIAT") {
    return (
      <Layout>
        <p className="text-sm text-neutral-500">This page is only available to the CODI Secretariat.</p>
      </Layout>
    );
  }

  const edit = (fn) => {
    setMessage("");
    setSections((current) => fn(current));
  };
  const editSection = (key, fn) => edit((list) => list.map((s) => (s.key === key ? fn(s) : s)));
  const editItem = (sectionKey, itemKey, fields) =>
    editSection(sectionKey, (s) => ({
      ...s,
      items: s.items.map((i) => (i.key === itemKey ? { ...i, ...fields } : i)),
    }));
  const toggleOpen = (key, value) =>
    setOpen((current) => {
      const next = new Set(current);
      if (value ?? !next.has(key)) next.add(key);
      else next.delete(key);
      return next;
    });

  function addSection() {
    const item = { key: newKey(), question: "", answer: "", roles: [] };
    edit((list) => [...list, { key: newKey(), title: "", items: [item] }]);
    toggleOpen(item.key, true);
  }

  function addQuestion(sectionKey) {
    const item = { key: newKey(), question: "", answer: "", roles: [] };
    editSection(sectionKey, (s) => ({ ...s, items: [...s.items, item] }));
    toggleOpen(item.key, true);
  }

  function removeSection(section) {
    if (section.items.length > 0 && !window.confirm(`Remove “${section.title || "this section"}” and its ${section.items.length} question(s)?`)) return;
    edit((list) => list.filter((s) => s.key !== section.key));
  }

  function removeQuestion(sectionKey, item) {
    if ((item.question || item.answer) && !window.confirm(`Remove “${item.question || "this question"}”?`)) return;
    // A section with no questions left goes too, so KODI never shows an empty heading.
    edit((list) =>
      list
        .map((s) => (s.key === sectionKey ? { ...s, items: s.items.filter((i) => i.key !== item.key) } : s))
        .filter((s) => s.key !== sectionKey || s.items.length > 0)
    );
  }

  async function save() {
    const problem = problemIn(sections);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.put("/faq", { entries: toEntries(sections) });
      loadInto(res.data);
      setOpen(new Set());
      setMessage("FAQs saved. Everyone sees the new version the next time they open KODI.");
    } catch (err) {
      setError(err.response?.data?.error || "The FAQs could not be saved");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!window.confirm("Discard your unsaved changes?")) return;
    loadInto(JSON.parse(savedJson));
    setOpen(new Set());
    setError("");
  }

  const count = sections ? sections.reduce((n, s) => n + s.items.length, 0) : 0;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">FAQs</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          The questions KODI answers in the help bubble on every page. Edit the wording, add or remove
          questions, and choose who sees each one. Nothing changes for anyone until you save.
        </p>
      </div>

      {message && <p className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{message}</p>}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {sections === null ? (
        !error && <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-neutral-500">
            {sections.length} section{sections.length === 1 ? "" : "s"} · {count} question{count === 1 ? "" : "s"}
          </p>

          <div className="space-y-4 pb-6">
            {sections.map((section, sIndex) => (
              <section key={section.key} className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-4 py-3">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Section title</span>
                    <input
                      value={section.title}
                      onChange={(e) => editSection(section.key, (s) => ({ ...s, title: e.target.value }))}
                      placeholder="Section title, e.g. Deadlines"
                      maxLength={80}
                      className={`${inputClass} font-semibold`}
                    />
                  </label>
                  <div className="flex gap-1">
                    <button type="button" className={smallButton} disabled={sIndex === 0} onClick={() => edit((l) => move(l, sIndex, -1))} aria-label={`Move section ${section.title} up`}>
                      ↑
                    </button>
                    <button type="button" className={smallButton} disabled={sIndex === sections.length - 1} onClick={() => edit((l) => move(l, sIndex, 1))} aria-label={`Move section ${section.title} down`}>
                      ↓
                    </button>
                    <button type="button" className={`${smallButton} text-red-700`} onClick={() => removeSection(section)}>
                      Remove section
                    </button>
                  </div>
                </div>

                <ul className="divide-y divide-neutral-100">
                  {section.items.map((item, iIndex) => {
                    const isOpen = open.has(item.key);
                    return (
                      <li key={item.key} className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => toggleOpen(item.key)}
                            aria-expanded={isOpen}
                            className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          >
                            <ChevronDownIcon
                              className={`mt-0.5 h-4 w-4 shrink-0 text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                            />
                            <span className="min-w-0">
                              <span className="block break-words text-sm font-medium text-neutral-800">
                                {item.question.trim() || <span className="italic text-neutral-400">New question</span>}
                              </span>
                              <span className="mt-0.5 block text-xs text-neutral-500">
                                {item.roles.length === 0 ? "Everyone" : item.roles.map((r) => ROLE_LABEL[r]).join(", ")}
                              </span>
                            </span>
                          </button>
                          <div className="flex shrink-0 gap-1">
                            <button type="button" className={smallButton} disabled={iIndex === 0} onClick={() => editSection(section.key, (s) => ({ ...s, items: move(s.items, iIndex, -1) }))} aria-label="Move question up">
                              ↑
                            </button>
                            <button type="button" className={smallButton} disabled={iIndex === section.items.length - 1} onClick={() => editSection(section.key, (s) => ({ ...s, items: move(s.items, iIndex, 1) }))} aria-label="Move question down">
                              ↓
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="mt-3 space-y-3 pl-6">
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-neutral-600">Question</span>
                              <input
                                value={item.question}
                                onChange={(e) => editItem(section.key, item.key, { question: e.target.value })}
                                maxLength={300}
                                className={inputClass}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-neutral-600">
                                Answer <span className="font-normal text-neutral-400">· each line is its own paragraph</span>
                              </span>
                              <textarea
                                value={item.answer}
                                onChange={(e) => editItem(section.key, item.key, { answer: e.target.value })}
                                rows={Math.min(10, Math.max(3, item.answer.split("\n").length + 1))}
                                className={inputClass}
                              />
                            </label>
                            <fieldset>
                              <legend className="mb-1 text-xs font-medium text-neutral-600">Who sees this</legend>
                              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-neutral-700">
                                <label className="inline-flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={item.roles.length === 0}
                                    onChange={() => editItem(section.key, item.key, { roles: [] })}
                                    className="accent-maroon"
                                  />
                                  Everyone
                                </label>
                                {FAQ_ROLES.map((role) => (
                                  <label key={role.value} className="inline-flex items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={item.roles.includes(role.value)}
                                      onChange={(e) =>
                                        editItem(section.key, item.key, {
                                          roles: e.target.checked
                                            ? [...item.roles, role.value]
                                            : item.roles.filter((r) => r !== role.value),
                                        })
                                      }
                                      className="accent-maroon"
                                    />
                                    {role.label}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <button type="button" className={`${smallButton} text-red-700`} onClick={() => removeQuestion(section.key, item)}>
                              Remove question
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="border-t border-neutral-100 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => addQuestion(section.key)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-maroon hover:underline"
                  >
                    <PlusIcon className="h-4 w-4" /> Add question
                  </button>
                </div>
              </section>
            ))}

            <button
              type="button"
              onClick={addSection}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-maroon hover:bg-neutral-50"
            >
              <PlusIcon className="h-4 w-4" /> Add section
            </button>
          </div>

          {/* Kept in view while scrolling, buttons on the left: KODI's own
              button holds the bottom-right corner. */}
          <div className="sticky bottom-0 z-30 -mx-4 -mb-6 flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-neutral-100/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save FAQs"}
            </button>
            <button
              type="button"
              onClick={discard}
              disabled={!dirty || saving}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              Discard
            </button>
            <p className="text-sm text-neutral-500">{dirty ? "You have unsaved changes." : "All changes saved."}</p>
          </div>
        </>
      )}
    </Layout>
  );
}
