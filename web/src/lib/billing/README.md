# Circulo Billing System Integration Guide

A comprehensive guide for integrating the billing system into your multi-agent chat platform.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Concepts](#core-concepts)
3. [Setup & Configuration](#setup--configuration)
4. [Usage Tracking](#usage-tracking)
5. [Limit Checks](#limit-checks)
6. [Resource Limits](#resource-limits)
7. [Rate Limiting](#rate-limiting)
8. [Stripe Webhooks](#stripe-webhooks)
9. [API Integration Examples](#api-integration-examples)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BILLING FLOW                             │
└─────────────────────────────────────────────────────────────────┘

User Action → Rate Limit Check → Usage Limit Check → Execute → Track Usage
                    │                   │                           │
                    ▼                   ▼                           ▼
            userRateLimits      checkServerSide              trackChatUsage()
                               UsageLimits()                        │
                                                                    ▼
                                                          checkAndBillOverage
                                                            Threshold()
```

### Billing Scopes

| Scope | Plan | Billing Entity | Usage Pooling |
|-------|------|----------------|---------------|
| Individual | Free/Pro | User | Per-user |
| Organization | Team/Enterprise | Organization | Pooled across members |

### Key Files

| File | Purpose |
|------|---------|
| `billing-context.ts` | Determines who pays for usage |
| `usage-tracking.ts` | Records costs after execution |
| `resource-limits.ts` | Enforces count-based limits |
| `usage-monitor.ts` | Pre-execution limit checks |
| `threshold-billing.ts` | Incremental overage billing |

---

## Core Concepts

### 1. Billing Context

Every billable action needs to know WHO pays. Since all Circulo chats belong to an organization, billing flows through the org's subscription:

```typescript
import { getChatBillingContext } from "@/lib/billing/circulo/billing-context";

const billing = await getChatBillingContext(chatId);
// Returns:
// {
//   scope: "organization",
//   referenceId: "org_xxx",      // Who gets billed
//   organizationId: "org_xxx",
//   plan: "team",
//   isPooled: true               // Usage shared across members
// }
```

### 2. Usage vs Resource Limits

| Type | What it Limits | Example |
|------|----------------|---------|
| **Usage Limits** | Dollar spend per billing period | $20/month for Pro |
| **Resource Limits** | Count of entities | 10 agents for Pro |
| **Rate Limits** | Requests per time window | 500 req/min |

### 3. Plan Hierarchy

```
Enterprise > Team > Pro > Free

- Free: $10 credits, 2 agents, 5 chats
- Pro: $20 base + overage, 10 agents, 50 chats
- Team: $40/seat base + overage, 50 agents, 500 chats (pooled)
- Enterprise: Custom pricing, unlimited resources
```

---

## Setup & Configuration

### Environment Variables

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_FREE_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx
STRIPE_TEAM_PRICE_ID=price_xxx

# Billing Limits (optional, has defaults)
FREE_TIER_COST_LIMIT=10
PRO_TIER_COST_LIMIT=20
TEAM_TIER_COST_LIMIT=40
OVERAGE_THRESHOLD_DOLLARS=50

# Storage Limits (in GB)
FREE_STORAGE_LIMIT_GB=1
PRO_STORAGE_LIMIT_GB=10
TEAM_STORAGE_LIMIT_GB=100
```

### Initialize User Stats

When a user signs up, create their stats record:

```typescript
import { handleNewUser } from "@/lib/billing/core/usage";

// In your auth callback or user creation flow
export async function onUserCreated(userId: string) {
  await handleNewUser(userId);
}
```

---

## Usage Tracking

### When to Track

Track usage AFTER successful execution of billable actions:

- LLM API calls (tokens used)
- Agent executions
- Knowledge base queries
- File processing

### Basic Usage Tracking

```typescript
import { trackChatUsage } from "@/lib/billing/circulo/usage-tracking";

// After successful AI execution
await trackChatUsage({
  chatId: "chat_xxx",
  userId: "user_xxx",        // Who triggered it
  cost: 0.0023,              // Cost in dollars
  metadata: {
    agentId: "agent_xxx",
    modelId: "gpt-4",
    inputTokens: 150,
    outputTokens: 200,
  },
});
```

### Cost Calculation Helper

```typescript
// lib/ai/pricing.ts
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4": { input: 0.03 / 1000, output: 0.06 / 1000 },
  "gpt-4-turbo": { input: 0.01 / 1000, output: 0.03 / 1000 },
  "gpt-3.5-turbo": { input: 0.0005 / 1000, output: 0.0015 / 1000 },
  "claude-3-opus": { input: 0.015 / 1000, output: 0.075 / 1000 },
  "claude-3-sonnet": { input: 0.003 / 1000, output: 0.015 / 1000 },
  "gemini-2.5-flash": { input: 0.00025 / 1000, output: 0.0005 / 1000 },
};

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[modelId] || MODEL_PRICING["gpt-3.5-turbo"];
  return (inputTokens * pricing.input) + (outputTokens * pricing.output);
}
```

---

## Limit Checks

### Pre-Execution Usage Check

**Always check before expensive operations:**

```typescript
import { canExecuteInChat } from "@/lib/billing/circulo/limits";

export async function handleChatMessage(chatId: string, userId: string) {
  // Check if user can execute
  const canExecute = await canExecuteInChat(chatId, userId);
  
  if (!canExecute.allowed) {
    throw new BillingError(canExecute.reason);
    // "Organization usage limit exceeded. Contact your admin."
    // OR "Usage limit exceeded. Please upgrade your plan."
  }
  
  // Proceed with execution...
}
```

### Server-Side Limit Check (API Routes)

```typescript
import { checkServerSideUsageLimits } from "@/lib/billing/usage-monitor";

export async function POST(req: Request) {
  const { userId } = await auth();
  
  const limits = await checkServerSideUsageLimits(userId);
  
  if (limits.isExceeded) {
    return Response.json(
      { error: limits.message },
      { status: 402 } // Payment Required
    );
  }
  
  // Continue...
}
```

### Check Subscription State

```typescript
import { getUserSubscriptionState } from "@/lib/billing/core/subscription";

const state = await getUserSubscriptionState(userId);

// Available properties:
// state.isPro      - Has Pro or higher
// state.isTeam     - Has Team or higher
// state.isEnterprise
// state.isFree
// state.planName   - "free" | "pro" | "team" | "enterprise"
// state.hasExceededLimit
// state.highestPrioritySubscription
```

### Feature Gating

```typescript
import { getUserSubscriptionState } from "@/lib/billing/core/subscription";

async function requirePlan(
  userId: string, 
  minimumPlan: "pro" | "team" | "enterprise"
) {
  const state = await getUserSubscriptionState(userId);
  
  const planHierarchy = { free: 0, pro: 1, team: 2, enterprise: 3 };
  const userLevel = planHierarchy[state.planName] || 0;
  const requiredLevel = planHierarchy[minimumPlan];
  
  if (userLevel < requiredLevel) {
    throw new UpgradeRequiredError(
      `This feature requires ${minimumPlan} plan or higher`
    );
  }
}

// Usage
await requirePlan(userId, "team"); // Throws if not team+
```

---

## Resource Limits

### Check Before Creating Resources

```typescript
import { checkResourceLimit } from "@/lib/billing/circulo/resource-limits";

// Before creating an agent
async function createAgent(data: CreateAgentInput) {
  const check = await checkResourceLimit(data.organizationId, "agents");
  
  if (!check.allowed) {
    throw new LimitError(check.reason);
    // "Agents limit reached (10/10). Upgrade your plan to add more."
  }
  
  return db.insert(agent).values(data).returning();
}
```

### Available Resource Types

```typescript
type ResourceType = 
  | "agents"         // Per organization
  | "knowledgeBases" // Per organization
  | "chats"          // Per organization
  | "chatMembers"    // Per chat (requires chatId)
  | "chatAgents"     // Per chat (requires chatId)
  | "kbSizeBytes";   // Storage per organization
```

### Context-Specific Checks

```typescript
// Chat members (per-chat limit)
const check = await checkResourceLimit(
  organizationId,
  "chatMembers",
  { chatId: "chat_xxx" }
);

// Storage with additional bytes
const check = await checkResourceLimit(
  organizationId,
  "kbSizeBytes",
  { additionalBytes: file.size }
);
```

### Get Current Usage for UI

```typescript
// For displaying "3/10 agents used"
const check = await checkResourceLimit(orgId, "agents");
console.log(`${check.current}/${check.limit} agents`);
```

---

## Rate Limiting

### Using the userRateLimits Table

```typescript
import { db } from "@/db";
import { userRateLimits } from "@/db/schema";
import { eq } from "drizzle-orm";

const RATE_LIMITS = {
  free: { syncApi: 60, asyncApi: 10, window: 60000 },
  pro: { syncApi: 300, asyncApi: 50, window: 60000 },
  team: { syncApi: 1000, asyncApi: 200, window: 60000 },
  enterprise: { syncApi: 5000, asyncApi: 1000, window: 60000 },
};

export async function checkRateLimit(
  referenceId: string, // orgId for pooled, userId for individual
  requestType: "sync" | "async",
  plan: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;
  const now = new Date();
  
  const record = await db
    .select()
    .from(userRateLimits)
    .where(eq(userRateLimits.referenceId, referenceId))
    .limit(1);
  
  if (record.length === 0) {
    // Create new record
    await db.insert(userRateLimits).values({
      referenceId,
      syncApiRequests: requestType === "sync" ? 1 : 0,
      asyncApiRequests: requestType === "async" ? 1 : 0,
      windowStart: now,
      lastRequestAt: now,
    });
    return { allowed: true };
  }
  
  const r = record[0];
  const windowExpired = now.getTime() - r.windowStart.getTime() > limits.window;
  
  if (windowExpired) {
    // Reset window
    await db
      .update(userRateLimits)
      .set({
        syncApiRequests: requestType === "sync" ? 1 : 0,
        asyncApiRequests: requestType === "async" ? 1 : 0,
        windowStart: now,
        lastRequestAt: now,
        isRateLimited: false,
      })
      .where(eq(userRateLimits.referenceId, referenceId));
    return { allowed: true };
  }
  
  const currentCount = requestType === "sync" 
    ? r.syncApiRequests 
    : r.asyncApiRequests;
  const limit = requestType === "sync" 
    ? limits.syncApi 
    : limits.asyncApi;
  
  if (currentCount >= limit) {
    const resetAt = new Date(r.windowStart.getTime() + limits.window);
    return {
      allowed: false,
      retryAfter: Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
    };
  }
  
  // Increment counter
  await db
    .update(userRateLimits)
    .set({
      [requestType === "sync" ? "syncApiRequests" : "asyncApiRequests"]: 
        currentCount + 1,
      lastRequestAt: now,
    })
    .where(eq(userRateLimits.referenceId, referenceId));
  
  return { allowed: true };
}
```

---

## Stripe Webhooks

### Webhook Handler Setup

```typescript
// app/api/webhooks/stripe/route.ts
import { headers } from "next/headers";
import Stripe from "stripe";
import {
  handleInvoiceFinalized,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from "@/lib/billing/webhooks/invoices";
import {
  handleSubscriptionCreated,
  handleSubscriptionDeleted,
} from "@/lib/billing/webhooks/subscription";
import { handleManualEnterpriseSubscription } from "@/lib/billing/enterprise";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get("stripe-signature")!;
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return new Response("Webhook signature verification failed", { 
      status: 400 
    });
  }
  
  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleManualEnterpriseSubscription(event);
        // Also handle via better-auth's Stripe plugin
        break;
        
      case "customer.subscription.deleted":
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted({
          id: sub.id,
          plan: sub.metadata?.plan || null,
          referenceId: sub.metadata?.referenceId || "",
          stripeSubscriptionId: sub.id,
          seats: parseInt(sub.metadata?.seats || "1"),
        });
        break;
        
      case "invoice.finalized":
        await handleInvoiceFinalized(event);
        break;
        
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event);
        break;
        
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;
    }
    
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("Webhook handler failed", { status: 500 });
  }
}
```

### Key Webhook Events

| Event | Handler | Purpose |
|-------|---------|---------|
| `invoice.finalized` | `handleInvoiceFinalized` | Bill overage, reset usage |
| `invoice.payment_succeeded` | `handleInvoicePaymentSucceeded` | Unblock users |
| `invoice.payment_failed` | `handleInvoicePaymentFailed` | Block users, send emails |
| `customer.subscription.deleted` | `handleSubscriptionDeleted` | Final overage bill |

---

## API Integration Examples

### Complete Chat Execution Flow

```typescript
// lib/ai/chat-executor.ts
import { generateText } from "ai";
import { canExecuteInChat } from "@/lib/billing/circulo/limits";
import { trackChatUsage } from "@/lib/billing/circulo/usage-tracking";
import { checkResourceLimit } from "@/lib/billing/circulo/resource-limits";
import { checkRateLimit } from "@/lib/billing/rate-limits";
import { calculateCost } from "@/lib/ai/pricing";

export async function executeChat(params: {
  chatId: string;
  userId: string;
  organizationId: string;
  agentId: string;
  messages: Message[];
}) {
  const { chatId, userId, organizationId, agentId, messages } = params;

  // 1. Rate limit check (fast, prevents abuse)
  const rateCheck = await checkRateLimit(organizationId, "sync", "team");
  if (!rateCheck.allowed) {
    throw new RateLimitError(
      `Rate limited. Retry after ${rateCheck.retryAfter}s`,
      { retryAfter: rateCheck.retryAfter }
    );
  }

  // 2. Usage limit check (billing)
  const usageCheck = await canExecuteInChat(chatId, userId);
  if (!usageCheck.allowed) {
    throw new BillingError(usageCheck.reason!);
  }

  // 3. Get agent and execute
  const agent = await getAgent(agentId);
  
  const result = await generateText({
    model: getModel(agent.model),
    system: agent.instructions,
    messages,
    tools: await getAgentTools(agent),
    maxTokens: agent.maxTokens,
    temperature: agent.temperature / 100, // Convert 0-100 to 0-1
  });

  // 4. Track usage (after success)
  const cost = calculateCost(
    agent.model,
    result.usage.promptTokens,
    result.usage.completionTokens
  );

  await trackChatUsage({
    chatId,
    userId,
    cost,
    metadata: {
      agentId,
      modelId: agent.model,
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
    },
  });

  return result;
}
```

### Agent CRUD with Limits

```typescript
// lib/agents/actions.ts
import { checkResourceLimit } from "@/lib/billing/circulo/resource-limits";
import { requirePlan } from "@/lib/billing/guards";

export async function createAgent(
  data: CreateAgentInput,
  userId: string,
  organizationId: string
) {
  // Check resource limit
  const limitCheck = await checkResourceLimit(organizationId, "agents");
  if (!limitCheck.allowed) {
    throw new LimitError(limitCheck.reason!);
  }
  
  // Check if model requires higher plan
  if (data.model.includes("gpt-4") || data.model.includes("claude-3-opus")) {
    await requirePlan(userId, "pro");
  }
  
  return db.insert(agent).values({
    ...data,
    organizationId,
    createdBy: userId,
  }).returning();
}

export async function addAgentToChat(
  chatId: string,
  agentId: string,
  userId: string
) {
  const chatRecord = await db
    .select({ organizationId: chat.organizationId })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);
  
  const limitCheck = await checkResourceLimit(
    chatRecord[0].organizationId,
    "chatAgents",
    { chatId }
  );
  
  if (!limitCheck.allowed) {
    throw new LimitError(limitCheck.reason!);
  }
  
  return db.insert(chatAgent).values({
    chatId,
    agentId,
    addedBy: userId,
  }).returning();
}
```

### Billing Dashboard API

```typescript
// app/api/billing/usage/route.ts
import { getUserUsageData } from "@/lib/billing/core/usage";
import { getSimplifiedBillingSummary } from "@/lib/billing/core/billing";
import { checkResourceLimit } from "@/lib/billing/circulo/resource-limits";

export async function GET(req: Request) {
  const { userId, organizationId } = await auth();
  
  // Get comprehensive billing data
  const summary = await getSimplifiedBillingSummary(userId, organizationId);
  
  // Get resource counts
  const [agents, chats, kbs] = await Promise.all([
    checkResourceLimit(organizationId, "agents"),
    checkResourceLimit(organizationId, "chats"),
    checkResourceLimit(organizationId, "knowledgeBases"),
  ]);
  
  return Response.json({
    billing: {
      plan: summary.plan,
      currentUsage: summary.currentUsage,
      limit: summary.usageLimit,
      percentUsed: summary.percentUsed,
      isWarning: summary.isWarning,
      isExceeded: summary.isExceeded,
      daysRemaining: summary.daysRemaining,
      periodEnd: summary.periodEnd,
    },
    resources: {
      agents: { current: agents.current, limit: agents.limit },
      chats: { current: chats.current, limit: chats.limit },
      knowledgeBases: { current: kbs.current, limit: kbs.limit },
    },
    organization: summary.organizationData,
  });
}
```

---

## Troubleshooting

### Common Issues

#### "User stats not found"
```typescript
// User wasn't properly initialized
import { handleNewUser } from "@/lib/billing/core/usage";
await handleNewUser(userId);
```

#### "Billing blocked" but payment succeeded
```typescript
// Webhook may not have processed - manually unblock
await db
  .update(userStats)
  .set({ billingBlocked: false })
  .where(eq(userStats.userId, userId));
```

#### Usage not resetting at period end
```typescript
// Check invoice.finalized webhook is configured
// Manually trigger reset if needed:
import { resetUsageForSubscription } from "@/lib/billing/webhooks/invoices";
await resetUsageForSubscription({ plan: "pro", referenceId: userId });
```

### Debug Queries

```sql
-- Check user's current billing state
SELECT 
  us.user_id,
  us.current_period_cost,
  us.current_usage_limit,
  us.billing_blocked,
  s.plan,
  s.status,
  s.period_end
FROM user_stats us
LEFT JOIN subscription s ON s.reference_id = us.user_id
WHERE us.user_id = 'user_xxx';

-- Check organization pooled usage
SELECT 
  m.organization_id,
  SUM(CAST(us.current_period_cost AS DECIMAL)) as total_usage,
  o.org_usage_limit
FROM member m
JOIN user_stats us ON us.user_id = m.user_id
JOIN organization o ON o.id = m.organization_id
WHERE m.organization_id = 'org_xxx'
GROUP BY m.organization_id, o.org_usage_limit;
```

### Testing Webhooks Locally

```bash
# Install Stripe CLI
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test events
stripe trigger invoice.payment_succeeded
stripe trigger customer.subscription.deleted
```

---

## Quick Reference

### Import Map

```typescript
// Billing context & tracking
import { getChatBillingContext } from "@/lib/billing/circulo/billing-context";
import { trackChatUsage } from "@/lib/billing/circulo/usage-tracking";
import { canExecuteInChat } from "@/lib/billing/circulo/limits";
import { checkResourceLimit } from "@/lib/billing/circulo/resource-limits";

// Core billing
import { getUserUsageData } from "@/lib/billing/core/usage";
import { getUserSubscriptionState } from "@/lib/billing/core/subscription";
import { getSimplifiedBillingSummary } from "@/lib/billing/core/billing";
import { checkServerSideUsageLimits } from "@/lib/billing/usage-monitor";

// Organization billing
import { getOrganizationBillingData } from "@/lib/billing/organization";
import { validateSeatAvailability } from "@/lib/billing/seat-management";
```

### Decision Tree

```
User wants to perform action
         │
         ▼
    Is it an API call?
    ┌────┴────┐
   Yes        No
    │          │
    ▼          ▼
 Check      Is it creating
 Rate       a resource?
 Limit      ┌────┴────┐
    │      Yes        No
    ▼       │          │
 Check      ▼          ▼
 Usage   Check      Check
 Limit   Resource   Usage
    │    Limit      Limit
    ▼       │          │
 Execute    ▼          ▼
    │    Create    Execute
    ▼       │          │
 Track      ▼          ▼
 Usage   (no track) Track
                    Usage
```


```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR APPLICATION                          │
│              (API routes, actions, services)                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  lib/billing/circulo/                        │
│    (Circulo-specific: chats, agents, KB context)            │
│                                                              │
│  • billing-context.ts  - Chat/Agent billing resolution      │
│  • usage-tracking.ts   - Track chat usage + model costs     │
│  • resource-limits.ts  - Agents, chats, KB limits           │
│  • limits.ts           - Pre-execution checks               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  lib/billing/core/                           │
│         (Generic billing: any SaaS can use)                  │
│                                                              │
│  • subscription.ts     - Plan detection, priority           │
│  • usage.ts            - User usage data, limits            │
│  • billing.ts          - Overage calculation, summaries     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              lib/billing/ (Infrastructure)                   │
│                                                              │
│  • threshold-billing.ts - $50 increment billing             │
│  • usage-monitor.ts     - Server-side limit checks          │
│  • stripe-client.ts     - Stripe API                        │
│  • webhooks/            - Stripe event handlers             │
│  • seat-management.ts   - Org invitations                   │
└─────────────────────────────────────────────────────────────┘
```

### Practical Import Guide

```ts
// ✅ For chat/agent operations (most common)
import { 
  preExecutionCheck,
  trackChatUsage,
  checkResourceLimit,
} from "@/lib/billing/circulo";

// ✅ For billing dashboard/settings UI
import { 
  getSimplifiedBillingSummary,
  getUserUsageData,
} from "@/lib/billing/core/billing";
import { getUserSubscriptionState } from "@/lib/billing/core/subscription";

// ✅ For organization admin pages
import { getOrganizationBillingData } from "@/lib/billing/organization";
import { validateSeatAvailability } from "@/lib/billing/seat-management";

// ✅ For Stripe webhooks (already set up)
import { handleInvoiceFinalized } from "@/lib/billing/webhooks/invoices";

// ❌ Don't import these directly in app code
// (circulo/ wraps these for you)
import { checkAndBillOverageThreshold } from "@/lib/billing/threshold-billing";
```