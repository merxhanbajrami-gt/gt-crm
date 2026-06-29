"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AddDealForm from "./pipeline/AddDealForm";
import type { CurrentUser } from "./pipeline/DealDrawer";
import type { Stage } from "@/lib/types";

// Reusable "+ Add deal" button + modal. Used on the pipeline board and the
// My Week landing page so a deal can be created from wherever you land.
export default function AddDealButton({
  stages,
  owners,
  currentUser,
}: {
  stages: Stage[];
  owners: [string, string][];
  currentUser: CurrentUser;
}) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  return (
    <>
      <button className="addbtn" onClick={() => setAdding(true)}>
        + Add deal
      </button>
      {adding && (
        <AddDealForm
          stages={stages}
          owners={owners}
          currentUser={currentUser}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
