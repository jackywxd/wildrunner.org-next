"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { AliasProposal } from "@/lib/ultrasignup/aliases";

/**
 * Admin review of UltraSignup names members' choices suggest.
 *
 * Read on demand, not with the page: it scans every imported record, and
 * an admin opening their own races page has not asked for that. Each
 * accepted name is one write to one event; proposals that share the name
 * leave the list together, because once it is an alias of one event the
 * others would make it ambiguous (the server refuses them anyway).
 */
export function UltraSignupAliasReview() {
  const [proposals, setProposals] = useState<AliasProposal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/members/ultrasignup-aliases", {
        credentials: "same-origin",
      });
      if (!response.ok) {
        setError("讀不到建議，請重新整理後再試。");
        return;
      }
      setProposals(((await response.json()) as { proposals: AliasProposal[] }).proposals);
      setAdded([]);
    } catch {
      setError("讀不到建議，請再試一次。");
    } finally {
      setBusy(false);
    }
  }

  async function accept(proposal: AliasProposal) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/members/ultrasignup-aliases", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias: proposal.alias, eventKey: proposal.eventKey }),
      });
      if (!response.ok) {
        let message = "沒有加入，請再試一次。";
        try {
          const body = (await response.json()) as { errors?: { message?: unknown }[] };
          const text = body.errors?.[0]?.message;
          if (response.status < 500 && typeof text === "string" && text) message = text;
        } catch {
          // The fallback above stands.
        }
        setError(message);
        return;
      }
      setProposals((current) => current?.filter((item) => item.name !== proposal.name) ?? null);
      setAdded((current) => [...current, `${proposal.alias} → ${proposal.eventName}`]);
    } catch {
      setError("沒有加入，請再試一次。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 border border-dashed border-border p-4">
      <div>
        <h2 className="font-heading text-sm font-semibold text-foreground/70">
          管理員：對齊 UltraSignup 名稱
        </h2>
        <p className="mt-1 text-xs text-foreground/50">
          會員手工對應過的場次和已批准的申請，整理成賽事的 UltraSignup
          名稱建議。加入後，之後所有會員的這場比賽都會直接對上。請先確認真的是同一場賽事。
        </p>
      </div>

      <Button
        data-testid="ultrasignup-aliases-load"
        disabled={busy}
        onClick={() => void load()}
        type="button"
        variant="outline"
      >
        {proposals ? "重新讀取建議" : "讀取建議"}
      </Button>

      {error && (
        <p className="text-sm text-destructive" data-testid="ultrasignup-aliases-error" role="alert">
          {error}
        </p>
      )}

      {added.length > 0 && (
        <p className="text-sm" data-testid="ultrasignup-aliases-added">
          已加入：{added.join("、")}
        </p>
      )}

      {proposals && proposals.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="ultrasignup-aliases-empty">
          目前沒有需要對齊的名稱。
        </p>
      )}

      {proposals && proposals.length > 0 && (
        <ul className="space-y-2">
          {proposals.map((proposal) => (
            <li
              className="flex flex-wrap items-start justify-between gap-3 border border-border p-3 text-sm"
              data-testid={`ultrasignup-alias-${proposal.eventKey}`}
              key={`${proposal.name}:${proposal.eventKey}`}
            >
              <div>
                <p>
                  {proposal.alias}　→　{proposal.eventName}
                </p>
                <p className="text-foreground/60">
                  {[
                    proposal.records > 0 ? `${proposal.records} 筆會員紀錄` : null,
                    proposal.requests > 0 ? `${proposal.requests} 筆已批准申請` : null,
                  ]
                    .filter(Boolean)
                    .join("、")}
                </p>
                {proposal.conflict && (
                  <p className="text-destructive">
                    這個名稱也被對應到其他賽事，只能選一場；請先查清楚是哪一場。
                  </p>
                )}
              </div>
              <Button
                data-testid={`ultrasignup-alias-add-${proposal.eventKey}`}
                disabled={busy}
                onClick={() => void accept(proposal)}
                type="button"
                variant="outline"
              >
                加入別名
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
