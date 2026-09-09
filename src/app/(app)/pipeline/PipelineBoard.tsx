"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ageClass, fmtAge, gbp, quietDays } from "@/lib/format";
import type { Deal, Stage } from "@/lib/types";
import DealDrawer, { type CurrentUser } from "./DealDrawer";
import AddDealForm from "./AddDealForm";

export default function PipelineBoard({
  stages,
  deals: initialDeals,
  owners,
  assignees,
  currentUser,
  dealsWithTask = [],
  initialDealId = null,
}: {
  stages: Stage[];
  deals: Deal[];
  owners: [string, string][];
  assignees: [string, string][];
  currentUser: CurrentUser;
  dealsWithTask?: string[];
  initialDealId?: string | null;
}) {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const withTask = useMemo(() => new Set(dealsWithTask), [dealsWithTask]);
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialDealId);
  const [adding, setAdding] = useState(false);
  const selectedDeal = deals.find((d) => d.id === selectedId) ?? null;

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      deals.filter((d) => {
        if (owner !== "all" && d.owner_code !== owner) return false;
        if (!q) return true;
        return [
          d.company,
          d.dealname,
          d.contact_name,
          d.title,
          d.email,
          d.client_type,
          d.owner_code,
          d.owner_name,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      }),
    [deals, owner, q],
  );

  async function restage(dealId: string, stage: string) {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === stage) return;
    // optimistic; the DB trigger stamps last_touched_at on the stage change
    const touched = new Date().toISOString();
    // winning flips New / Ex-Client → Existing Client (DB trigger, 0017)
    const clientType =
      stage === "won" &&
      (deal.client_type === "New Client" || deal.client_type === "Ex-Client")
        ? "Existing Client"
        : deal.client_type;
    setDeals((ds) =>
      ds.map((d) =>
        d.id === dealId
          ? {
              ...d,
              stage: stage as Deal["stage"],
              last_touched_at: touched,
              client_type: clientType,
            }
          : d,
      ),
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ stage })
      .eq("id", dealId);
    if (error) {
      // revert on failure
      setDeals((ds) =>
        ds.map((d) => (d.id === dealId ? { ...d, stage: deal.stage } : d)),
      );
      alert("Could not move deal: " + error.message);
    } else {
      // record the move in the deal's activity feed (same as the drawer path)
      const from = stages.find((s) => s.id === deal.stage)?.name ?? deal.stage;
      const to = stages.find((s) => s.id === stage)?.name ?? stage;
      await supabase.from("actions").insert({
        deal_id: dealId,
        owner_id: currentUser.id,
        owner_code: currentUser.repCode,
        kind: "stage",
        note: `Moved ${from} → ${to}`,
      });
      router.refresh();
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <button className="addbtn" onClick={() => setAdding(true)}>
          + Add deal
        </button>
        <select
          className="ownerfilter"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          aria-label="Filter by owner"
        >
          <option value="all">All owners</option>
          {owners.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <input
          className="search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search deals, companies, contacts, client types, owners"
          aria-label="Search the pipeline"
        />
      </div>

      <div className="kanban">
        {stages.map((s) => {
          const ds = filtered
            .filter((d) => d.stage === s.id)
            .sort((a, b) => b.value - a.value);
          const sum = ds.reduce((a, d) => a + d.value, 0);
          return (
            <div
              key={s.id}
              className="kcol"
              data-stage={s.id}
              style={{ ["--kc" as string]: s.color ?? "#7B7AE6" }}
              onDragOver={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).classList.add("dragover");
              }}
              onDragLeave={(e) =>
                (e.currentTarget as HTMLElement).classList.remove("dragover")
              }
              onDrop={(e) => {
                (e.currentTarget as HTMLElement).classList.remove("dragover");
                if (dragId) restage(dragId, s.id);
                setDragId(null);
              }}
            >
              <div className="kcol-banner">
                <div className="kverb">
                  <span>{s.verb}</span>
                  <span className="ksum">
                    {ds.length} · {gbp(sum)}
                  </span>
                </div>
                <div className="kname">{s.name}</div>
                <div className="kdesc">{s.descr}</div>
              </div>
              <div className="kcards">
                {ds.map((d) => {
                  const ac = ageClass(d);
                  const quiet = quietDays(d.last_touched_at);
                  const noTask = d.stage !== "won" && !withTask.has(d.id);
                  return (
                    <div
                      key={d.id}
                      className={`kcard${ac ? " age-" + ac : ""}${
                        noTask ? " no-task" : ""
                      }`}
                      draggable
                      onDragStart={() => setDragId(d.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setSelectedId(d.id)}
                      style={{ cursor: "pointer" }}
                    >
                      {/* card title is the deal name (defaults to "Company –
                          Contact"); contact below beats client type for
                          telling deals apart at a glance (Oleksandr, Aug 2026) */}
                      <div className="kco" title={d.dealname ?? d.company ?? ""}>
                        {d.hot && (
                          <span
                            className="actiondot"
                            style={{ background: "var(--amber)" }}
                            title="Hot"
                          />
                        )}
                        {d.dealname || d.company}
                        {noTask && (
                          <span className="notask-chip" title="No active task">
                            no task
                          </span>
                        )}
                      </div>
                      <div className="kval">
                        {d.value > 0 ? gbp(d.value) + " · " : ""}
                        {d.contact_name || "No contact"}
                      </div>
                      <div className="kfoot">
                        <span className={`kage ${ac}`}>
                          {d.stage === "won"
                            ? "won"
                            : quiet >= 1
                              ? fmtAge(quiet) + " quiet"
                              : "active today"}
                        </span>
                        <span
                          className="owner-dot"
                          style={{
                            width: 22,
                            height: 22,
                            fontSize: "8.5px",
                          }}
                        >
                          {d.owner_code}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {adding && (
        <AddDealForm
          stages={stages}
          owners={owners}
          currentUser={currentUser}
          onClose={() => setAdding(false)}
          onCreated={(d) => {
            setDeals((ds) => [d, ...ds]);
            setAdding(false);
            setSelectedId(d.id);
          }}
        />
      )}

      {selectedDeal && (
        <DealDrawer
          key={selectedDeal.id}
          deal={selectedDeal}
          stages={stages}
          owners={owners}
          assignees={assignees}
          currentUser={currentUser}
          onClose={() => setSelectedId(null)}
          onChanged={(updated) =>
            setDeals((ds) =>
              ds.map((x) => (x.id === updated.id ? updated : x)),
            )
          }
          onDeleted={(id) => {
            setDeals((ds) => ds.filter((x) => x.id !== id));
            setSelectedId(null);
          }}
        />
      )}
    </>
  );
}
