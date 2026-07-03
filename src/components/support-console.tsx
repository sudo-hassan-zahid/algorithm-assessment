"use client";

import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Inbox,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { StatusBadge } from "./status-badge";

type Customer = { id: string; name: string; email: string };
type QueueItem = {
  id: string;
  message: string;
  status: string;
  decision: string | null;
  decisionReason: string | null;
  createdAt: string;
  customer: Customer;
  escalation: { id: string; status: string; action: string; reason: string } | null;
};
type Detail = QueueItem & {
  escalation: (QueueItem["escalation"] & {
    proposedAmount: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    order: { id: string; status: string; totalAmount: string; currency: string; version: number } | null;
  }) | null;
  agentRuns: Array<{ id: string; status: string; model: string; finalOutcome: string | null; error: string | null }>;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: unknown;
    result: unknown;
    status: string;
    createdAt: string;
  }>;
  events: Array<{ id: string; eventType: string; actorType: string; actorId: string | null; createdAt: string }>;
  refund: { id: string; amount: string; currency: string; createdAt: string } | null;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load support data");
  return response.json() as Promise<T>;
};

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function SupportConsole() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "ESCALATED">("ALL");
  const [composerOpen, setComposerOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { data: queue = [], mutate: refreshQueue, isLoading } = useSWR<QueueItem[]>("/api/requests", fetcher, {
    refreshInterval: 3000,
  });
  const activeId = selectedId ?? queue[0]?.id ?? null;
  const { data: detail, mutate: refreshDetail } = useSWR<Detail>(
    activeId ? `/api/requests/${activeId}` : null,
    fetcher,
    { refreshInterval: 3000 },
  );

  const visibleQueue = useMemo(
    () => (filter === "ESCALATED" ? queue.filter((item) => item.status === "ESCALATED") : queue),
    [filter, queue],
  );

  async function review(decision: "APPROVE" | "REJECT") {
    if (!detail?.escalation) return;
    setNotice(null);
    const response = await fetch(`/api/escalations/${detail.escalation.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reviewer: "Assessment Reviewer" }),
    });
    const result = (await response.json()) as { error?: string };
    await Promise.all([refreshDetail(), refreshQueue()]);
    setNotice({
      tone: response.ok ? "success" : "error",
      text: response.ok
        ? decision === "APPROVE"
          ? "Action approved and executed safely."
          : "Escalation rejected."
        : result.error ?? "The escalation changed. Latest state loaded.",
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark"><ShieldCheck size={19} /></div>
          <div><strong>Relay</strong><span>Support operations</span></div>
        </div>
        <div className="topbar__right">
          <span className="system-health"><i /> Systems operational</span>
          <button className="avatar" aria-label="Reviewer profile">AR</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="queue-panel">
          <div className="queue-panel__header">
            <div>
              <p className="eyebrow">Workspace</p>
              <h1>Support queue</h1>
            </div>
            <button className="icon-button" onClick={() => setComposerOpen(true)} aria-label="New request"><Plus size={18} /></button>
          </div>
          <div className="queue-tabs">
            <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>All <span>{queue.length}</span></button>
            <button className={filter === "ESCALATED" ? "active" : ""} onClick={() => setFilter("ESCALATED")}>
              Needs review <span>{queue.filter((item) => item.status === "ESCALATED").length}</span>
            </button>
          </div>

          <div className="queue-list">
            {isLoading && <div className="empty-state"><RefreshCw className="spin" size={20} /> Loading queue</div>}
            {!isLoading && !visibleQueue.length && <div className="empty-state"><Inbox size={24} /> No requests here</div>}
            {visibleQueue.map((item) => (
              <button
                className={`queue-card ${item.id === activeId ? "queue-card--active" : ""}`}
                key={item.id}
                onClick={() => { setSelectedId(item.id); setNotice(null); }}
              >
                <div className="queue-card__meta"><span>{item.customer.name}</span><time>{relativeTime(item.createdAt)}</time></div>
                <p>{item.message}</p>
                <div className="queue-card__footer"><StatusBadge status={item.status} /><ChevronRight size={16} /></div>
              </button>
            ))}
          </div>
        </aside>

        <section className="detail-panel">
          {!detail ? (
            <div className="detail-empty"><Inbox size={32} /><h2>Select a request</h2><p>Choose an item to inspect the agent decision and take action.</p></div>
          ) : (
            <RequestDetail detail={detail} notice={notice} onReview={review} />
          )}
        </section>
      </section>

      {composerOpen && (
        <RequestComposer
          onClose={() => setComposerOpen(false)}
          onCreated={async (id) => {
            await refreshQueue();
            setSelectedId(id);
            setComposerOpen(false);
          }}
        />
      )}
    </main>
  );
}

function RequestDetail({
  detail,
  notice,
  onReview,
}: {
  detail: Detail;
  notice: { tone: "success" | "error"; text: string } | null;
  onReview: (decision: "APPROVE" | "REJECT") => Promise<void>;
}) {
  const [reviewing, setReviewing] = useState(false);
  const escalation = detail.escalation;
  const order = escalation?.order;

  async function act(decision: "APPROVE" | "REJECT") {
    setReviewing(true);
    try { await onReview(decision); } finally { setReviewing(false); }
  }

  return (
    <div className="detail-content">
      <div className="detail-heading">
        <div>
          <div className="heading-meta"><StatusBadge status={detail.status} /><span>#{detail.id.slice(0, 8)}</span></div>
          <h2>{detail.message}</h2>
          <p><UserRound size={15} /> {detail.customer.name} · {detail.customer.email} · {relativeTime(detail.createdAt)}</p>
        </div>
      </div>

      {notice && <div className={`notice notice--${notice.tone}`}>{notice.tone === "success" ? <Check size={17} /> : <AlertTriangle size={17} />}{notice.text}</div>}

      <div className="decision-grid">
        <article className="panel decision-card">
          <div className="panel__title"><span className="icon-tile icon-tile--violet"><Bot size={18} /></span><div><p>Agent decision</p><h3>{detail.decision?.replace("_", " ") ?? "Awaiting decision"}</h3></div></div>
          <p className="decision-reason">{detail.decisionReason ?? "The agent is still evaluating this request."}</p>
          <div className="assurance"><ShieldCheck size={16} /><span>Policy-enforced</span><small>Actions are revalidated by backend guardrails.</small></div>
        </article>

        <article className="panel">
          <div className="panel__title"><span className="icon-tile"><Package size={18} /></span><div><p>Relevant order</p><h3>{order ? `Order #${order.id}` : "No verified order"}</h3></div></div>
          {order ? (
            <dl className="order-facts">
              <div><dt>Status</dt><dd>{order.status}</dd></div>
              <div><dt>Paid</dt><dd>{order.currency} {Number(order.totalAmount).toFixed(2)}</dd></div>
              <div><dt>Version</dt><dd>{order.version}</dd></div>
            </dl>
          ) : <p className="muted-copy">The agent could not associate a customer-owned order with this request.</p>}
        </article>
      </div>

      {escalation && (
        <article className="panel action-card">
          <div className="action-card__summary">
            <div className="panel__title"><span className="icon-tile icon-tile--amber"><CircleDollarSign size={18} /></span><div><p>Proposed action</p><h3>{escalation.action}</h3></div></div>
            {escalation.proposedAmount && order && <strong>{order.currency} {Number(escalation.proposedAmount).toFixed(2)}</strong>}
          </div>
          <p>{escalation.reason}</p>
          {escalation.status === "PENDING" ? (
            <div className="review-actions">
              <button className="button button--secondary" disabled={reviewing} onClick={() => act("REJECT")}><X size={17} /> Reject</button>
              <button className="button button--primary" disabled={reviewing || !order || !["REFUND", "CANCEL"].includes(escalation.action)} onClick={() => act("APPROVE")}><Check size={17} /> Approve & execute</button>
            </div>
          ) : (
            <div className="reviewed-state"><ShieldCheck size={17} /> {escalation.status} by {escalation.reviewedBy}</div>
          )}
        </article>
      )}

      <article className="panel trace-panel">
        <div className="panel__title"><span className="icon-tile"><Clock3 size={18} /></span><div><p>Audit trail</p><h3>Agent activity</h3></div></div>
        {!detail.toolCalls.length && <p className="muted-copy">No tool calls were recorded.</p>}
        <div className="trace-list">
          {detail.toolCalls.map((call, index) => (
            <details key={call.id} className="trace-item">
              <summary><span>{index + 1}</span><code>{call.name}</code><StatusBadge status={call.status === "SUCCEEDED" ? "APPROVED" : "FAILED"} /><ChevronRight size={15} /></summary>
              <div className="trace-data"><div><p>Arguments</p><pre>{JSON.stringify(call.arguments, null, 2)}</pre></div><div><p>Result</p><pre>{JSON.stringify(call.result, null, 2)}</pre></div></div>
            </details>
          ))}
        </div>
      </article>
    </div>
  );
}

function RequestComposer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { data: customers = [] } = useSWR<Customer[]>("/api/customers", fetcher);
  const [customerId, setCustomerId] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const activeCustomerId = customerId || customers[0]?.id || "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: activeCustomerId, message }),
      });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Could not process request");
      onCreated(result.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not process request");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="composer" onSubmit={submit}>
        <div className="composer__heading"><div><p className="eyebrow">Agent intake</p><h2>New support request</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div>
        <label>Customer<select value={activeCustomerId} onChange={(event) => setCustomerId(event.target.value)} required>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name} — {customer.email}</option>)}</select></label>
        <label>Customer message<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="I want a refund for order 1043." minLength={3} maxLength={2000} required /></label>
        <div className="examples"><span>Try an example</span>{["I want a refund for order 1043.", "Cancel order 1044, it hasn't shipped.", "Order 1045 arrived damaged. Send a replacement."].map((example) => <button type="button" key={example} onClick={() => setMessage(example)}>{example}</button>)}</div>
        {error && <p className="form-error"><AlertTriangle size={15} /> {error}</p>}
        <div className="composer__actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={submitting || !activeCustomerId}>{submitting ? <RefreshCw className="spin" size={17} /> : <Bot size={17} />} {submitting ? "Agent is working…" : "Submit to agent"}</button></div>
      </form>
    </div>
  );
}
