"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Idea, IdeaPriority } from "@/lib/types";

const COLUMNS: { id: IdeaPriority; name: string; verb: string; color: string }[] =
  [
    { id: "high", name: "High priority", verb: "Do soon", color: "var(--red)" },
    { id: "medium", name: "Medium", verb: "On the radar", color: "var(--amber)" },
    { id: "low", name: "Low / someday", verb: "Park it", color: "var(--gt-blue)" },
  ];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function IdeaBoard({
  ideas: initial,
  currentUser,
}: {
  ideas: Idea[];
  currentUser: { id: string; fullName: string };
}) {
  const supabase = createClient();
  const [ideas, setIdeas] = useState<Idea[]>(initial);
  const [view, setView] = useState<"board" | "trash">("board");
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // add-idea composer
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [suggestedBy, setSuggestedBy] = useState("");

  const active = ideas.filter((i) => i.status === "active");
  const trashed = ideas.filter((i) => i.status === "trashed");

  function patchLocal(id: string, patch: Partial<Idea>) {
    setIdeas((xs) => xs.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function persist(id: string, patch: Partial<Idea>) {
    const { error } = await supabase.from("ideas").update(patch).eq("id", id);
    if (error) alert("Could not save: " + error.message);
  }

  async function addIdea(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    // new ideas land at the top of Medium (lowest sort wins the ascending order)
    const minSort = Math.min(0, ...active.map((i) => i.sort));
    const { data, error } = await supabase
      .from("ideas")
      .insert({
        title: t,
        detail: detail.trim() || null,
        suggested_by: suggestedBy.trim() || null,
        priority: "medium",
        sort: minSort - 1,
        author_id: currentUser.id,
        author_name: currentUser.fullName,
      })
      .select()
      .single();
    setBusy(false);
    if (error) {
      alert("Could not add idea: " + error.message);
      return;
    }
    setIdeas((xs) => [data as Idea, ...xs]);
    setTitle("");
    setDetail("");
    setSuggestedBy("");
  }

  function dropInColumn(priority: IdeaPriority) {
    if (!dragId) return;
    const idea = ideas.find((i) => i.id === dragId);
    setDragId(null);
    if (!idea || idea.priority === priority) return;
    // append to the end of the target column
    const maxSort = Math.max(
      0,
      ...active.filter((i) => i.priority === priority).map((i) => i.sort),
    );
    patchLocal(idea.id, { priority, sort: maxSort + 1 });
    persist(idea.id, { priority, sort: maxSort + 1 });
  }

  async function trash(id: string) {
    patchLocal(id, { status: "trashed" });
    await persist(id, { status: "trashed" });
  }
  async function restore(id: string) {
    patchLocal(id, { status: "active" });
    await persist(id, { status: "active" });
  }
  async function deleteForever(id: string) {
    if (!confirm("Delete this idea permanently? This can't be undone.")) return;
    setIdeas((xs) => xs.filter((i) => i.id !== id));
    const { error } = await supabase.from("ideas").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
  }

  return (
    <>
      {/* add idea */}
      <form
        onSubmit={addIdea}
        className="panel"
        style={{ padding: 16, marginBottom: 16, display: "grid", gap: 10 }}
      >
        <input
          className="dedit"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A new idea — e.g. round table for retail with John"
        />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10 }}>
          <input
            className="dedit"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Detail (optional)"
          />
          <input
            className="dedit"
            value={suggestedBy}
            onChange={(e) => setSuggestedBy(e.target.value)}
            placeholder="Suggested by (optional)"
          />
          <button className="addbtn" type="submit" disabled={busy || !title.trim()}>
            {busy ? "Adding…" : "+ Add idea"}
          </button>
        </div>
      </form>

      {/* view switch */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <button
          className={`filterbtn${view === "board" ? " on" : ""}`}
          onClick={() => setView("board")}
        >
          Board ({active.length})
        </button>
        <button
          className={`filterbtn${view === "trash" ? " on" : ""}`}
          onClick={() => setView("trash")}
        >
          Trash ({trashed.length})
        </button>
      </div>

      {view === "board" ? (
        <div className="kanban" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {COLUMNS.map((col) => {
            const cards = active
              .filter((i) => i.priority === col.id)
              .sort((a, b) => a.sort - b.sort);
            return (
              <div
                key={col.id}
                className="kcol"
                style={{ ["--kc" as string]: col.color }}
                onDragOver={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).classList.add("dragover");
                }}
                onDragLeave={(e) =>
                  (e.currentTarget as HTMLElement).classList.remove("dragover")
                }
                onDrop={(e) => {
                  (e.currentTarget as HTMLElement).classList.remove("dragover");
                  dropInColumn(col.id);
                }}
              >
                <div className="kcol-banner">
                  <div className="kverb">
                    <span>{col.verb}</span>
                    <span className="ksum">{cards.length}</span>
                  </div>
                  <div className="kname">{col.name}</div>
                </div>
                <div className="kcards">
                  {cards.length === 0 && (
                    <div
                      className="kdesc"
                      style={{ padding: "8px 4px", color: "var(--text-faint)" }}
                    >
                      Drop ideas here.
                    </div>
                  )}
                  {cards.map((i) => (
                    <div
                      key={i.id}
                      className="kcard"
                      draggable
                      onDragStart={() => setDragId(i.id)}
                      onDragEnd={() => setDragId(null)}
                      style={{ borderLeftColor: col.color }}
                    >
                      <div className="kco">{i.title}</div>
                      {i.detail && <div className="kval">{i.detail}</div>}
                      <div className="kfoot">
                        <span className="kage">
                          {i.suggested_by ? `via ${i.suggested_by} · ` : ""}
                          {fmtDate(i.created_at)}
                        </span>
                        <button
                          className="ctx-del"
                          onClick={() => trash(i.id)}
                          title="Move to trash"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <h2>Trash</h2>
            <span className="count">{trashed.length}</span>
          </div>
          {trashed.length === 0 ? (
            <div className="kdesc" style={{ padding: 20 }}>
              Nothing in the trash.
            </div>
          ) : (
            trashed.map((i) => (
              <div className="action-row" key={i.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{i.title}</div>
                  <div className="statsub">
                    {i.detail || "—"}
                    {i.suggested_by ? ` · via ${i.suggested_by}` : ""}
                  </div>
                </div>
                <button className="cad-btn" onClick={() => restore(i.id)}>
                  Restore
                </button>
                <button className="ctx-del" onClick={() => deleteForever(i.id)}>
                  Delete forever
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
