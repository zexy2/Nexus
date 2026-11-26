/**
 * Public demo scenario: "Customer Order Tracking App".
 *
 * Pure data + helpers only (no DB imports) so both the server seed
 * (lib/demo-scenario.ts) and the client guided tour can use it.
 *
 * The plan, requirements and tasks tell the same story as the landing page:
 * customers register, place orders, follow a status timeline and see their
 * history, while support staff review flagged orders.
 */

export const DEMO_PLAN_TITLE = "Customer Order Tracking App";

/** Block whose text the guided tour's sample edit replaces. */
export const DEMO_EDIT_BLOCK_ID = "demo-req-003";
export const DEMO_EDIT_REQUIREMENT_KEY = "REQ-003";

type InlineText = { type: "text"; text: string; styles: Record<string, boolean> };
type DemoBlock = {
  id: string;
  type: "heading" | "paragraph" | "bulletListItem";
  props: Record<string, unknown>;
  content: InlineText[];
  children: DemoBlock[];
};

function text(value: string, bold = false): InlineText {
  return { type: "text", text: value, styles: bold ? { bold: true } : {} };
}

function block(
  id: string,
  type: DemoBlock["type"],
  content: InlineText[],
  props: Record<string, unknown> = {}
): DemoBlock {
  return { id, type, props, content, children: [] };
}

export type DemoRequirementSeed = {
  stableKey: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  confidence: number;
};

export const DEMO_REQUIREMENTS: DemoRequirementSeed[] = [
  {
    stableKey: "REQ-001",
    title: "Customer accounts",
    description:
      "Customers register with email and password, verify their email address, and only ever see their own orders.",
    acceptanceCriteria: [
      "A new customer can register and must verify the email before placing an order.",
      "Order lists and order detail pages only return orders owned by the signed-in customer.",
    ],
    confidence: 94,
  },
  {
    stableKey: "REQ-002",
    title: "Order placement",
    description:
      "Customers place an order from the catalog with a delivery address and payment confirmation; every order gets a unique order number.",
    acceptanceCriteria: [
      "Checkout requires a delivery address and a confirmed payment.",
      "Each placed order receives a unique, human-readable order number.",
    ],
    confidence: 91,
  },
  {
    stableKey: "REQ-003",
    title: "Order status timeline",
    description:
      "Customers follow each order through a timeline (placed, packed, shipped, delivered) and receive an email when the order ships.",
    acceptanceCriteria: [
      "The order page shows placed, packed, shipped and delivered steps with timestamps.",
      "An email is sent to the customer when the order status changes to shipped.",
    ],
    confidence: 88,
  },
  {
    stableKey: "REQ-004",
    title: "Admin order review",
    description:
      "Support staff review flagged orders, update their status and add internal notes; every status change records who made it.",
    acceptanceCriteria: [
      "Flagged orders appear in a support queue.",
      "Every status change is stored with the staff member and time.",
    ],
    confidence: 86,
  },
  {
    stableKey: "REQ-005",
    title: "Order history",
    description:
      "Customers browse their past orders, filter them by status and reorder a previous order in one click.",
    acceptanceCriteria: [
      "Past orders can be filtered by status.",
      "Reorder copies the items of a previous order into a new cart.",
    ],
    confidence: 82,
  },
];

const requirementBlockIds: Record<string, string> = {
  "REQ-001": "demo-req-001",
  "REQ-002": "demo-req-002",
  "REQ-003": DEMO_EDIT_BLOCK_ID,
  "REQ-004": "demo-req-004",
  "REQ-005": "demo-req-005",
};

function requirementBlock(requirement: DemoRequirementSeed): DemoBlock {
  return block(requirementBlockIds[requirement.stableKey]!, "bulletListItem", [
    text(`${requirement.stableKey} ${requirement.title}`, true),
    text(` — ${requirement.description}`),
  ]);
}

/** BlockNote JSON for the seeded plan document. */
export const DEMO_PLAN_CONTENT: DemoBlock[] = [
  block("demo-plan-title", "heading", [text(DEMO_PLAN_TITLE)], { level: 2 }),
  block("demo-plan-goal", "paragraph", [
    text(
      "Goal: let customers register, place orders and follow every order until it is delivered, while support staff can step in when an order needs attention."
    ),
  ]),
  block("demo-plan-requirements", "heading", [text("Requirements")], { level: 3 }),
  ...DEMO_REQUIREMENTS.map(requirementBlock),
  block("demo-plan-scope", "heading", [text("Out of scope")], { level: 3 }),
  block("demo-plan-scope-body", "paragraph", [
    text("Native mobile apps and multi-currency checkout are not part of this release."),
  ]),
];

/** The edit the guided tour suggests for REQ-003 (adds SMS + push). */
export const DEMO_SAMPLE_EDIT_TEXT =
  "Customers follow each order through a timeline (placed, packed, shipped, out for delivery, delivered). They get an SMS and an email when the order ships and a push notification when it is out for delivery; each channel can be turned off in settings.";

export function demoSampleEditInline(): InlineText[] {
  return [
    text(`${DEMO_EDIT_REQUIREMENT_KEY} Order status timeline`, true),
    text(` — ${DEMO_SAMPLE_EDIT_TEXT}`),
  ];
}

/**
 * Plain text of a BlockNote document, byte-for-byte the same algorithm the
 * plan-impact activity uses to fill `plan_versions.content_text`
 * (`textFromDocumentContent` in packages/workflows/src/activities.ts; a unit
 * test keeps the two in sync).
 */
export function planContentText(value: unknown): string {
  const chunks: string[] = [];

  const visit = (node: unknown) => {
    if (typeof node === "string") {
      chunks.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") chunks.push(record.text);
    if (record.content !== undefined) visit(record.content);
    if (record.children !== undefined) visit(record.children);
  };

  visit(value);
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

export type DemoTaskSeed = {
  key: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  /** Requirement the task delivers; null = intentionally orphaned. */
  requirementKey: string | null;
};

export const DEMO_TASKS: DemoTaskSeed[] = [
  {
    key: "signup",
    title: "Email sign-up with verification",
    description: "Registration form, verification email and a guard that blocks checkout until the email is verified.",
    status: "done",
    priority: "high",
    requirementKey: "REQ-001",
  },
  {
    key: "order-scope",
    title: "Scope order queries to the signed-in customer",
    description: "Every order read filters by the session's customer id; add a test for cross-account access.",
    status: "done",
    priority: "urgent",
    requirementKey: "REQ-001",
  },
  {
    key: "checkout",
    title: "Checkout with delivery address and payment confirmation",
    description: "Address form, payment confirmation step and order creation in one transaction.",
    status: "in_progress",
    priority: "high",
    requirementKey: "REQ-002",
  },
  {
    key: "order-number",
    title: "Generate unique order numbers",
    description: "Human-readable order numbers (e.g. NX-24-000123) backed by a unique index.",
    status: "done",
    priority: "medium",
    requirementKey: "REQ-002",
  },
  {
    key: "timeline",
    title: "Order status timeline component",
    description: "Timeline with placed, packed, shipped and delivered steps and their timestamps.",
    status: "in_review",
    priority: "high",
    requirementKey: "REQ-003",
  },
  {
    key: "shipped-email",
    title: "Send the 'order shipped' email",
    description: "Transactional email triggered when an order moves to shipped.",
    status: "todo",
    priority: "medium",
    requirementKey: "REQ-003",
  },
  {
    key: "support-queue",
    title: "Support queue for flagged orders",
    description: "List flagged orders for support staff with status update and internal notes.",
    status: "todo",
    priority: "medium",
    requirementKey: "REQ-004",
  },
  {
    key: "status-audit",
    title: "Record who changed an order status",
    description: "Store the staff member and timestamp for every status change.",
    status: "in_review",
    priority: "medium",
    requirementKey: "REQ-004",
  },
  {
    key: "history",
    title: "Order history page with status filter and reorder",
    description: "Past orders list, status filter and a one-click reorder button.",
    status: "in_progress",
    priority: "medium",
    requirementKey: "REQ-005",
  },
  {
    key: "dark-mode",
    title: "Dark mode for the storefront",
    description: "Nice to have, but no requirement in the plan asks for it — shows up as orphaned work.",
    status: "todo",
    priority: "low",
    requirementKey: null,
  },
  {
    key: "loyalty-spike",
    title: "Spike: loyalty points",
    description: "Exploration that is not in the accepted plan — shows up as orphaned work.",
    status: "todo",
    priority: "low",
    requirementKey: null,
  },
];
