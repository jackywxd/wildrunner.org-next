"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Whether the club rail is drifting down on its own (播放, `TimelinePlayer`).
 *
 * A context because the two things that care are not related in the tree:
 * the button that starts the drift sits in the page header, and the rows that
 * fade in differently while it runs (`TimelineReveal`) are deep in the feed.
 * Outside the provider — a member's own timeline, 成員對照 — nothing drifts,
 * and the rows reveal as they always have.
 */

type Drift = { drifting: boolean; setDrifting: (drifting: boolean) => void };

const Context = createContext<Drift>({ drifting: false, setDrifting: () => undefined });

export function TimelineDriftProvider({ children }: { children: ReactNode }) {
  const [drifting, setDrifting] = useState(false);
  const value = useMemo(() => ({ drifting, setDrifting }), [drifting]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTimelineDrift(): Drift {
  return useContext(Context);
}
