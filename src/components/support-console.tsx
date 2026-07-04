"use client";

import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  CircleDollarSign,
  Clock3,
  Inbox,
  Mail,
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
type CustomerSummary = Customer & {
  createdAt: string;
  orderCount: number;
};
type CustomerDetail = CustomerSummary & {
  orders: Array<{
    id: string;
    status: string;
    totalAmount: string;
    currency: string;
    version: number;
    createdAt: string;
    updatedAt: string;
  }>;
};
type QueueItem = {
  id: string;
  message: string;
  status: string;
  decision: string | null;
  decisionReason: string | null;
  createdAt: string;
  customer: Customer;
  escalation: {
    id: string;
    status: string;
    action: string;
    reason: string;
  } | null;
};
type Detail = QueueItem & {
  escalation:
    | (QueueItem["escalation"] & {
        proposedAmount: string | null;
        reviewedBy: string | null;
        reviewedAt: string | null;
        order: {
          id: string;
          status: string;
          totalAmount: string;
          currency: string;
          version: number;
        } | null;
      })
    | null;
  agentRuns: Array<{
    id: string;
    status: string;
    model: string;
    finalOutcome: string | null;
    error: string | null;
  }>;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: unknown;
    result: unknown;
    status: string;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    actorType: string;
    actorId: string | null;
    createdAt: string;
  }>;
  refund: {
    id: string;
    amount: string;
    currency: string;
    createdAt: string;
  } | null;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load support data");
  return response.json() as Promise<T>;
};

function relativeTime(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function formatDecisionLabel(value: string | null) {
  return value ? value.replaceAll("_", " ") : "Awaiting decision";
}

function requestBanner(detail: Detail) {
  if (detail.status === "ESCALATED") return "Reviewer action needed";
  if (detail.status === "AUTO_EXECUTED") return "Resolved automatically";
  if (detail.status === "APPROVED") return "Approved and executed";
  if (detail.status === "REJECTED") return "Closed by reviewer";
  if (detail.status === "FAILED") return "Automation fell back to review";
  return "Actively processing";
}

export function SupportConsole() {
  const [section, setSection] = useState<"REQUESTS" | "CUSTOMERS">("REQUESTS");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [filter, setFilter] = useState<"ALL" | "ESCALATED">("ALL");
  const [composerOpen, setComposerOpen] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const {
    data: queue = [],
    mutate: refreshQueue,
    isLoading: queueLoading,
  } = useSWR<QueueItem[]>("/api/requests", fetcher, {
    refreshInterval: 3000,
  });
  const {
    data: customerList = [],
    isLoading: customerListLoading,
  } = useSWR<CustomerSummary[]>(
    "/api/customers",
    fetcher,
    { refreshInterval: 3000 },
  );

  const activeId = selectedId ?? queue[0]?.id ?? null;
  const activeCustomerId =
    selectedCustomerId ?? customerList[0]?.id ?? null;

  const {
    data: detail,
    mutate: refreshDetail,
    isLoading: detailLoading,
  } = useSWR<Detail>(
    activeId ? `/api/requests/${activeId}` : null,
    fetcher,
    { refreshInterval: 3000 },
  );
  const {
    data: customerDetail,
    isLoading: customerDetailLoading,
  } = useSWR<CustomerDetail>(
    activeCustomerId ? `/api/customers/${activeCustomerId}` : null,
    fetcher,
    { refreshInterval: 3000 },
  );

  const visibleQueue = useMemo(
    () =>
      filter === "ESCALATED"
        ? queue.filter((item) => item.status === "ESCALATED")
        : queue,
    [filter, queue],
  );

  const reviewCount = queue.filter((item) => item.status === "ESCALATED").length;
  const autoResolvedCount = queue.filter(
    (item) => item.status === "AUTO_EXECUTED" || item.status === "APPROVED",
  ).length;

  async function review(decision: "APPROVE" | "REJECT") {
    if (!detail?.escalation) return;
    setNotice(null);
    const response = await fetch(
      `/api/escalations/${detail.escalation.id}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewer: "Assessment Reviewer" }),
      },
    );
    const result = (await response.json()) as { error?: string };
    await Promise.all([refreshDetail(), refreshQueue()]);
    setNotice({
      tone: response.ok ? "success" : "error",
      text: response.ok
        ? decision === "APPROVE"
          ? "Action approved and executed safely."
          : "Escalation rejected."
        : (result.error ?? "The escalation changed. Latest state loaded."),
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark">
            <ShieldCheck size={19} />
          </div>
          <div>
            <strong>Relay</strong>
            <span>Support operations</span>
          </div>
        </div>
        <div className="topbar__right">
          <div className="topbar__stats">
            <span>
              Queue <strong>{queue.length}</strong>
            </span>
            <span>
              Reviews <strong>{reviewCount}</strong>
            </span>
          </div>
          <span className="system-health">
            <i /> Systems operational
          </span>
          <button className="avatar" aria-label="Reviewer profile">
            AR
          </button>
        </div>
      </header>

      <div className="workspace-switcher-wrap">
        <div
          className="workspace-switcher"
          data-active={section === "REQUESTS" ? "left" : "right"}
        >
          <span className="workspace-switcher__slider" aria-hidden="true" />
          <button
            className={section === "REQUESTS" ? "active" : ""}
            onClick={() => setSection("REQUESTS")}
          >
            Support Queue
          </button>
          <button
            className={section === "CUSTOMERS" ? "active" : ""}
            onClick={() => setSection("CUSTOMERS")}
          >
            Customers
          </button>
        </div>
      </div>

      <section className="workspace">
        {section === "REQUESTS" ? (
          <aside className="queue-panel">
            <div className="queue-panel__header">
              <div>
                <p className="eyebrow">Workspace</p>
                <div className="title-with-help">
                  <h1>Support queue</h1>
                  <HelpTip text="Review incoming support requests here, filter the queue, and open a case to inspect the agent's decision." />
                </div>
              </div>
              <button
                className="icon-button queue-panel__action"
                onClick={() => setComposerOpen(true)}
                aria-label="New request"
                title="Create a new seeded support request to send through the agent flow."
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="queue-tabs">
              <button
                className={filter === "ALL" ? "active" : ""}
                onClick={() => setFilter("ALL")}
                title="Show every request in the queue, including resolved items."
              >
                All <span>{queue.length}</span>
              </button>
              <button
                className={filter === "ESCALATED" ? "active" : ""}
                onClick={() => setFilter("ESCALATED")}
                title="Show only requests that still need a human reviewer."
              >
                Needs review <span>{reviewCount}</span>
              </button>
            </div>

            <div
              className="queue-insights"
              title="Quick summary of the queue volume, review load, and seeded customer coverage."
            >
              <div>
                <span>Needs review</span>
                <strong>{reviewCount}</strong>
              </div>
              <div>
                <span>Resolved</span>
                <strong>{autoResolvedCount}</strong>
              </div>
              <div>
                <span>Customers</span>
                <strong>{customerList.length}</strong>
              </div>
            </div>

            <div className="queue-list">
              {queueLoading && <LoadingState label="Loading queue" />}
              {!queueLoading && !visibleQueue.length && (
                <div className="empty-state">
                  <Inbox size={24} /> No requests here
                </div>
              )}
              {visibleQueue.map((item) => (
                <button
                  className={`queue-card queue-card--${item.status.toLowerCase()} ${item.id === activeId ? "queue-card--active" : ""}`}
                  key={item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    setNotice(null);
                  }}
                >
                  <div className="queue-card__meta">
                    <span>{item.customer.name}</span>
                    <time>{relativeTime(item.createdAt)}</time>
                  </div>
                  <p>{item.message}</p>
                  <div className="queue-card__signal">
                    <strong>{formatDecisionLabel(item.decision)}</strong>
                    <span>
                      {item.escalation?.reason ??
                        item.decisionReason ??
                        "Awaiting verified action details."}
                    </span>
                  </div>
                  <div className="queue-card__footer">
                    <StatusBadge status={item.status} />
                    <ChevronRight size={16} />
                  </div>
                </button>
              ))}
            </div>
          </aside>
        ) : (
          <aside className="queue-panel">
            <div className="queue-panel__header">
              <div>
                <p className="eyebrow">Workspace</p>
                <div className="title-with-help">
                  <h1>Customers</h1>
                  <HelpTip text="Browse seeded customers, then inspect account context and drill into their orders when you need more detail." />
                </div>
              </div>
            </div>
            <div className="queue-list">
              {customerListLoading && <LoadingState label="Loading customers" />}
              {!customerListLoading && !customerList.length && (
                <div className="empty-state">
                  <Inbox size={24} /> No customers found
                </div>
              )}
              {customerList.map((customer) => (
                <button
                  className={`queue-card queue-card--customer ${customer.id === activeCustomerId ? "queue-card--active" : ""}`}
                  key={customer.id}
                  onClick={() => setSelectedCustomerId(customer.id)}
                >
                  <div className="queue-card__meta">
                    <span>{customer.name}</span>
                    <time>{customer.orderCount} orders</time>
                  </div>
                  <p>{customer.email}</p>
                  <div className="queue-card__signal">
                    <strong>Customer overview</strong>
                    <span>
                      Created {relativeTime(customer.createdAt)} with{" "}
                      {customer.orderCount} available orders.
                    </span>
                  </div>
                  <div className="queue-card__footer">
                    <span className="customer-pill">Customer record</span>
                    <ChevronRight size={16} />
                  </div>
                </button>
              ))}
            </div>
          </aside>
        )}

        <section className="detail-panel">
          {section === "REQUESTS" ? (
            detailLoading && activeId ? (
              <DetailLoadingState
                title="Loading request"
                description="Pulling the latest agent decision, order context, and audit trail."
              />
            ) : !detail ? (
              <div className="detail-empty">
                <Inbox size={32} />
                <h2>Select a request</h2>
                <p>
                  Choose an item to inspect the agent decision and take action.
                </p>
              </div>
            ) : (
              <RequestDetail detail={detail} notice={notice} onReview={review} />
            )
          ) : customerDetailLoading && activeCustomerId ? (
            <DetailLoadingState
              title="Loading customer"
              description="Collecting the customer profile and recent orders."
            />
          ) : !customerDetail ? (
            <div className="detail-empty">
              <Inbox size={32} />
              <h2>Select a customer</h2>
              <p>Choose a customer to inspect their account and orders.</p>
            </div>
          ) : (
            <CustomerDetailPanel detail={customerDetail} />
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

function LoadingState({ label }: { label: string }) {
  return (
    <div className="empty-state loading-state" aria-live="polite">
      <RefreshCw className="spin" size={20} />
      {label}
    </div>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="help-tip" tabIndex={0} aria-label={text} role="note">
      <CircleHelp size={14} />
      <span className="help-tip__bubble">{text}</span>
    </span>
  );
}

function DetailLoadingState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="detail-empty detail-empty--loading" aria-live="polite">
      <RefreshCw className="spin" size={30} />
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function CustomerDetailPanel({ detail }: { detail: CustomerDetail }) {
  return (
    <div className="detail-content">
      <div className="detail-heading">
        <div>
          <div className="heading-meta">
            <span className="customer-pill">Customer</span>
            <span>#{detail.id.slice(0, 8)}</span>
          </div>
          <h2>{detail.name}</h2>
          <p>
            <Mail size={15} /> {detail.email} · {detail.orderCount} orders
          </p>
        </div>
      </div>

      <section className="hero-card hero-card--customer">
        <div>
          <span className="hero-card__label">Customer context</span>
          <h3>{detail.name} account overview</h3>
          <p>
            Scan the profile first, then expand individual orders only when you
            need exact amounts, versions, or timestamps.
          </p>
        </div>
        <div className="hero-card__facts">
          <div>
            <span>Total orders</span>
            <strong>{detail.orderCount}</strong>
          </div>
          <div>
            <span>Latest update</span>
            <strong>
              {detail.orders[0] ? relativeTime(detail.orders[0].updatedAt) : "N/A"}
            </strong>
          </div>
        </div>
      </section>

      <div className="decision-grid">
        <article className="panel">
          <div className="panel__title">
            <span className="icon-tile">
              <UserRound size={18} />
            </span>
            <div className="panel__title-copy">
              <p>Customer profile</p>
              <div className="panel__title-row">
                <h3>Account overview</h3>
                <HelpTip text="High-level customer facts for quick triage before you inspect individual orders." />
              </div>
            </div>
          </div>
          <dl className="order-facts">
            <div>
              <dt>Name</dt>
              <dd>{detail.name}</dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>{detail.orderCount}</dd>
            </div>
            <div>
              <dt>Customer since</dt>
              <dd>{relativeTime(detail.createdAt)}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel__title">
            <span className="icon-tile">
              <Package size={18} />
            </span>
            <div className="panel__title-copy">
              <p>Order footprint</p>
              <div className="panel__title-row">
                <h3>Live order directory</h3>
                <HelpTip text="Use this section to understand order coverage before expanding exact status, amount, and timestamps below." />
              </div>
            </div>
          </div>
          <p className="muted-copy">
            Expand any order to inspect its status, amount, version, and recent
            timestamps.
          </p>
        </article>
      </div>

      <article className="panel trace-panel">
        <div className="panel__title">
          <span className="icon-tile">
            <Package size={18} />
          </span>
          <div className="panel__title-copy">
            <p>Orders</p>
            <div className="panel__title-row">
              <h3>Customer orders</h3>
              <HelpTip text="Expand an order only when you need its latest snapshot and timestamp history." />
            </div>
          </div>
        </div>
        {!detail.orders.length && (
          <p className="muted-copy">This customer does not have any orders.</p>
        )}
        <div className="trace-list customer-orders">
          {detail.orders.map((order) => (
            <details key={order.id} className="trace-item">
              <summary>
                <span>#</span>
                <code>Order {order.id}</code>
                <StatusBadge status={order.status} />
                <ChevronRight size={15} />
              </summary>
              <div className="trace-data">
                <div>
                  <p>Snapshot</p>
                  <pre>
                    {JSON.stringify(
                      {
                        id: order.id,
                        status: order.status,
                        version: order.version,
                        total:
                          `${order.currency} ${Number(order.totalAmount).toFixed(2)}`,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
                <div>
                  <p>Timestamps</p>
                  <pre>
                    {JSON.stringify(
                      {
                        createdAt: order.createdAt,
                        updatedAt: order.updatedAt,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      </article>
    </div>
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
    try {
      await onReview(decision);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="detail-content">
      <div className="detail-heading">
        <div>
          <div className="heading-meta">
            <StatusBadge status={detail.status} />
            <span>#{detail.id.slice(0, 8)}</span>
          </div>
          <div className="title-with-help title-with-help--detail">
            <h2>{detail.message}</h2>
            <HelpTip text="This is the original customer request being reviewed against verified order data and policy rules." />
          </div>
          <p>
            <UserRound size={15} /> {detail.customer.name} ·{" "}
            {detail.customer.email} · {relativeTime(detail.createdAt)}
          </p>
        </div>
      </div>

      <section
        className={`hero-card ${detail.status === "ESCALATED" ? "hero-card--alert" : "hero-card--neutral"}`}
      >
        <div>
          <span className="hero-card__label">{requestBanner(detail)}</span>
          <h3>{formatDecisionLabel(detail.decision)}</h3>
          <p>
            {detail.decisionReason ??
              "The request is still being evaluated against verified order data."}
          </p>
        </div>
        <div className="hero-card__facts">
          <div>
            <span>Request state</span>
            <strong>{detail.status.replaceAll("_", " ")}</strong>
          </div>
          <div>
            <span>Tool calls</span>
            <strong>{detail.toolCalls.length}</strong>
          </div>
          <div>
            <span>Escalation</span>
            <strong>{escalation?.action ?? "None"}</strong>
          </div>
        </div>
      </section>

      {notice && (
        <div className={`notice notice--${notice.tone}`}>
          {notice.tone === "success" ? (
            <Check size={17} />
          ) : (
            <AlertTriangle size={17} />
          )}
          {notice.text}
        </div>
      )}

      <div className="decision-grid">
        <article className="panel decision-card">
          <div className="panel__title">
            <span className="icon-tile icon-tile--violet">
              <Bot size={18} />
            </span>
            <div className="panel__title-copy">
              <p>Agent decision</p>
              <div className="panel__title-row">
                <h3>{formatDecisionLabel(detail.decision)}</h3>
                <HelpTip text="The model's proposed outcome after checking tools and policy constraints." />
              </div>
            </div>
          </div>
          <p className="decision-reason">
            {detail.decisionReason ??
              "The agent is still evaluating this request."}
          </p>
          <div className="assurance">
            <ShieldCheck size={16} />
            <span>Policy-enforced</span>
            <small>Actions are revalidated by backend guardrails.</small>
          </div>
        </article>

        <article className="panel">
          <div className="panel__title">
            <span className="icon-tile">
              <Package size={18} />
            </span>
            <div className="panel__title-copy">
              <p>Relevant order</p>
              <div className="panel__title-row">
                <h3>{order ? `Order #${order.id}` : "No verified order"}</h3>
                <HelpTip text="Verified order facts used to approve, reject, or safely block the agent's proposed action." />
              </div>
            </div>
          </div>
          {order ? (
            <dl className="order-facts">
              <div>
                <dt>Status</dt>
                <dd>{order.status}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd>
                  {order.currency} {Number(order.totalAmount).toFixed(2)}
                </dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{order.version}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted-copy">
              The agent could not associate a customer-owned order with this
              request.
            </p>
          )}
        </article>
      </div>

      {escalation && (
        <article className="panel action-card">
          <div className="action-card__summary">
            <div className="panel__title">
              <span className="icon-tile icon-tile--amber">
                <CircleDollarSign size={18} />
              </span>
              <div className="panel__title-copy">
                <p>Proposed action</p>
                <div className="panel__title-row">
                  <h3>{escalation.action}</h3>
                  <HelpTip text="This is the exact action waiting for review or the final action that already reached a terminal state." />
                </div>
              </div>
            </div>
            {escalation.proposedAmount && order && (
              <strong>
                {order.currency} {Number(escalation.proposedAmount).toFixed(2)}
              </strong>
            )}
          </div>
          <div className="action-banner">
            <AlertTriangle size={18} />
            <div>
              <strong>
                {escalation.status === "PENDING"
                  ? "Reviewer checkpoint"
                  : "Escalation outcome"}
              </strong>
              <span>
                {escalation.status === "PENDING"
                  ? "Approve only when the verified order facts and policy rules line up."
                  : "This escalation already reached a terminal review state."}
              </span>
            </div>
          </div>
          <p>{escalation.reason}</p>
          {escalation.status === "PENDING" ? (
            <div className="review-actions">
              <button
                className="button button--secondary"
                disabled={reviewing}
                onClick={() => act("REJECT")}
              >
                <X size={17} /> Reject
              </button>
              <button
                className="button button--primary"
                disabled={
                  reviewing ||
                  !order ||
                  !["REFUND", "CANCEL"].includes(escalation.action)
                }
                onClick={() => act("APPROVE")}
              >
                <Check size={17} /> Approve & execute
              </button>
            </div>
          ) : (
            <div className="reviewed-state">
              <ShieldCheck size={17} /> {escalation.status} by{" "}
              {escalation.reviewedBy}
            </div>
          )}
        </article>
      )}

      <article className="panel trace-panel">
        <div className="panel__title">
          <span className="icon-tile">
            <Clock3 size={18} />
          </span>
          <div className="panel__title-copy">
            <p>Audit trail</p>
            <div className="panel__title-row">
              <h3>Agent activity</h3>
              <HelpTip text="Expandable tool-call history showing what the agent asked for and what the backend returned." />
            </div>
          </div>
        </div>
        {!detail.toolCalls.length && (
          <p className="muted-copy">No tool calls were recorded.</p>
        )}
        <div className="trace-list">
          {detail.toolCalls.map((call, index) => (
            <details key={call.id} className="trace-item">
              <summary>
                <span>{index + 1}</span>
                <code>{call.name}</code>
                <StatusBadge
                  status={call.status === "SUCCEEDED" ? "APPROVED" : "FAILED"}
                />
                <ChevronRight size={15} />
              </summary>
              <div className="trace-data">
                <div>
                  <p>Arguments</p>
                  <pre>{JSON.stringify(call.arguments, null, 2)}</pre>
                </div>
                <div>
                  <p>Result</p>
                  <pre>{JSON.stringify(call.result, null, 2)}</pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      </article>
    </div>
  );
}

function RequestComposer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const {
    data: customers = [],
    isLoading: customersLoading,
  } = useSWR<Customer[]>(
    "/api/customers",
    fetcher,
  );
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
      if (!response.ok || !result.id)
        throw new Error(result.error ?? "Could not process request");
      onCreated(result.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not process request",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="composer" onSubmit={submit}>
        <div className="composer__heading">
          <div>
            <p className="eyebrow">Agent intake</p>
            <div className="title-with-help">
              <h2>New support request</h2>
              <HelpTip text="Create a sample customer message and send it through the full agent, policy, and review workflow." />
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label>
          <span className="label-with-help">
            Customer
            <HelpTip text="Choose which seeded customer is sending the support message." />
          </span>
          <select
            value={activeCustomerId}
            onChange={(event) => setCustomerId(event.target.value)}
            disabled={customersLoading || !customers.length}
            required
          >
            {customersLoading && <option value="">Loading customers...</option>}
            {customers.map((customer) => (
              <option value={customer.id} key={customer.id}>
                {customer.name} - {customer.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label-with-help">
            Customer message
            <HelpTip text="Write the exact request the model should interpret, such as refund, cancellation, or replacement intent." />
          </span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="I want a refund for order 1043."
            minLength={3}
            maxLength={2000}
            required
          />
        </label>
        <div className="examples">
          <span>Try an example</span>
          {[
            "I want a refund for order 1043.",
            "Cancel order 1044, it hasn't shipped.",
            "Order 1045 arrived damaged. Send a replacement.",
          ].map((example) => (
            <button
              type="button"
              key={example}
              onClick={() => setMessage(example)}
            >
              {example}
            </button>
          ))}
        </div>
        {error && (
          <p className="form-error">
            <AlertTriangle size={15} /> {error}
          </p>
        )}
        <div className="composer__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button button--primary"
            disabled={submitting || customersLoading || !activeCustomerId}
          >
            {submitting ? (
              <RefreshCw className="spin" size={17} />
            ) : (
              <Bot size={17} />
            )}{" "}
            {submitting
              ? "Agent is working..."
              : customersLoading
                ? "Loading customers..."
                : "Submit to agent"}
          </button>
        </div>
      </form>
    </div>
  );
}
