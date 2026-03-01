/**
 * Marketplace Billing System
 * 
 * Handles all financial aspects of the marketplace including
 * usage tracking, invoice generation, subscription management,
 * and payment processing integration.
 * 
 * Architecture:
 * ```
 * BillingSystem
 *   ├── UsageTracker (metered usage per service)
 *   ├── InvoiceGenerator (periodic billing)
 *   ├── SubscriptionManager (plan management)
 *   └── PaymentProcessor (payment gateway integration)
 * ```
 */

import type { PricingModel, PricingTier, UsagePricing } from './service-package';

// ============================================================
// BILLING TYPES
// ============================================================

export type BillingPeriod = 'monthly' | 'quarterly' | 'annual';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired' | 'trial' | 'past_due';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export interface BillingAccount {
  /** Account ID */
  id: string;
  /** Organization/user ID */
  ownerId: string;
  /** Account name */
  name: string;
  /** Billing email */
  email: string;
  /** Currency */
  currency: string;
  /** Payment method on file */
  paymentMethod?: PaymentMethod;
  /** Current balance (in cents) */
  balance: number;
  /** Credit limit (in cents) */
  creditLimit: number;
  /** Tax information */
  taxInfo?: TaxInfo;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_transfer' | 'crypto' | 'credits';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface TaxInfo {
  taxId?: string;
  taxType?: 'vat' | 'gst' | 'sales_tax';
  country: string;
  region?: string;
  exempt: boolean;
}

export interface Subscription {
  id: string;
  accountId: string;
  serviceId: string;
  /** Pricing tier name */
  tierName: string;
  /** Subscription status */
  status: SubscriptionStatus;
  /** Billing period */
  period: BillingPeriod;
  /** Price per period (in cents) */
  pricePerPeriod: number;
  /** Currency */
  currency: string;
  /** Current period start */
  currentPeriodStart: number;
  /** Current period end */
  currentPeriodEnd: number;
  /** Trial end date */
  trialEnd?: number;
  /** Cancel at period end */
  cancelAtPeriodEnd: boolean;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

export interface UsageRecord {
  id: string;
  accountId: string;
  serviceId: string;
  /** Usage metric name */
  metric: string;
  /** Usage quantity */
  quantity: number;
  /** Unit of measurement */
  unit: string;
  /** Timestamp of usage */
  timestamp: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface Invoice {
  id: string;
  accountId: string;
  /** Invoice number (human-readable) */
  invoiceNumber: string;
  /** Invoice status */
  status: InvoiceStatus;
  /** Billing period start */
  periodStart: number;
  /** Billing period end */
  periodEnd: number;
  /** Line items */
  lineItems: InvoiceLineItem[];
  /** Subtotal (in cents) */
  subtotal: number;
  /** Tax amount (in cents) */
  tax: number;
  /** Discount amount (in cents) */
  discount: number;
  /** Total amount (in cents) */
  total: number;
  /** Currency */
  currency: string;
  /** Due date */
  dueDate: number;
  /** Paid date */
  paidDate?: number;
  /** Payment ID */
  paymentId?: string;
  /** Created timestamp */
  createdAt: number;
}

export interface InvoiceLineItem {
  /** Service ID */
  serviceId: string;
  /** Service name */
  serviceName: string;
  /** Description */
  description: string;
  /** Line item type */
  type: 'subscription' | 'usage' | 'one-time' | 'credit' | 'discount';
  /** Quantity */
  quantity: number;
  /** Unit price (in cents) */
  unitPrice: number;
  /** Total (in cents) */
  total: number;
  /** Usage metric (for usage-based items) */
  metric?: string;
  /** Free quota used */
  freeQuotaUsed?: number;
}

export interface Payment {
  id: string;
  accountId: string;
  invoiceId: string;
  /** Payment amount (in cents) */
  amount: number;
  /** Currency */
  currency: string;
  /** Payment status */
  status: PaymentStatus;
  /** Payment method used */
  paymentMethod: PaymentMethod;
  /** External payment gateway reference */
  gatewayReference?: string;
  /** Created timestamp */
  createdAt: number;
  /** Completed timestamp */
  completedAt?: number;
  /** Failure reason */
  failureReason?: string;
}

export interface BillingEvent {
  type: 'billing:usage.recorded' | 'billing:invoice.created' | 'billing:invoice.paid' |
    'billing:payment.completed' | 'billing:payment.failed' | 'billing:subscription.created' |
    'billing:subscription.cancelled' | 'billing:subscription.renewed' | 'billing:refund.processed';
  accountId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// ============================================================
// USAGE TRACKER
// ============================================================

export class UsageTracker {
  private records: UsageRecord[] = [];
  private counters: Map<string, number> = new Map();

  /**
   * Record a usage event
   */
  record(accountId: string, serviceId: string, metric: string, quantity: number, unit: string, metadata?: Record<string, unknown>): UsageRecord {
    const record: UsageRecord = {
      id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      accountId,
      serviceId,
      metric,
      quantity,
      unit,
      timestamp: Date.now(),
      metadata,
    };

    this.records.push(record);

    // Update counter
    const key = `${accountId}:${serviceId}:${metric}`;
    this.counters.set(key, (this.counters.get(key) || 0) + quantity);

    return record;
  }

  /**
   * Get usage for a specific account and service within a time range
   */
  getUsage(accountId: string, serviceId: string, startTime: number, endTime: number): UsageRecord[] {
    return this.records.filter(r =>
      r.accountId === accountId &&
      r.serviceId === serviceId &&
      r.timestamp >= startTime &&
      r.timestamp <= endTime
    );
  }

  /**
   * Get aggregated usage by metric
   */
  getAggregatedUsage(
    accountId: string,
    serviceId: string,
    startTime: number,
    endTime: number
  ): Map<string, { total: number; unit: string; count: number }> {
    const usage = this.getUsage(accountId, serviceId, startTime, endTime);
    const aggregated = new Map<string, { total: number; unit: string; count: number }>();

    for (const record of usage) {
      const existing = aggregated.get(record.metric) || { total: 0, unit: record.unit, count: 0 };
      existing.total += record.quantity;
      existing.count++;
      aggregated.set(record.metric, existing);
    }

    return aggregated;
  }

  /**
   * Get current period usage counter
   */
  getCurrentUsage(accountId: string, serviceId: string, metric: string): number {
    const key = `${accountId}:${serviceId}:${metric}`;
    return this.counters.get(key) || 0;
  }

  /**
   * Reset period counters (called at billing period boundary)
   */
  resetPeriodCounters(accountId: string): void {
    for (const [key] of this.counters) {
      if (key.startsWith(`${accountId}:`)) {
        this.counters.set(key, 0);
      }
    }
  }

  /**
   * Get total records count
   */
  getTotalRecords(): number {
    return this.records.length;
  }
}

// ============================================================
// SUBSCRIPTION MANAGER
// ============================================================

export class SubscriptionManager {
  private subscriptions: Map<string, Subscription> = new Map();

  /**
   * Create a new subscription
   */
  create(
    accountId: string,
    serviceId: string,
    pricing: PricingModel,
    tierName?: string,
    period: BillingPeriod = 'monthly'
  ): Subscription {
    const now = Date.now();
    const periodMs = this.getPeriodMs(period);

    // Determine price
    let pricePerPeriod = pricing.basePrice || 0;
    if (tierName && pricing.tiers) {
      const tier = pricing.tiers.find(t => t.name === tierName);
      if (tier) {
        pricePerPeriod = tier.price;
      }
    }

    // Adjust for billing period
    if (period === 'quarterly') {
      pricePerPeriod = pricePerPeriod * 3;
    } else if (period === 'annual') {
      pricePerPeriod = pricePerPeriod * 12 * 0.8; // 20% annual discount
    }

    const subscription: Subscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      accountId,
      serviceId,
      tierName: tierName || 'default',
      status: pricing.trialDays ? 'trial' : 'active',
      period,
      pricePerPeriod: Math.round(pricePerPeriod),
      currency: pricing.currency || 'USD',
      currentPeriodStart: now,
      currentPeriodEnd: now + periodMs,
      trialEnd: pricing.trialDays ? now + (pricing.trialDays * 86400000) : undefined,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(subscription.id, subscription);
    console.log(`[Billing] Subscription created: ${subscription.id} for ${serviceId}`);
    return subscription;
  }

  /**
   * Cancel a subscription
   */
  cancel(subscriptionId: string, immediate: boolean = false): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;

    if (immediate) {
      sub.status = 'cancelled';
      sub.updatedAt = Date.now();
    } else {
      sub.cancelAtPeriodEnd = true;
      sub.updatedAt = Date.now();
    }

    this.subscriptions.set(subscriptionId, sub);
    console.log(`[Billing] Subscription ${immediate ? 'cancelled' : 'set to cancel at period end'}: ${subscriptionId}`);
    return true;
  }

  /**
   * Pause a subscription
   */
  pause(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub || sub.status !== 'active') return false;

    sub.status = 'paused';
    sub.updatedAt = Date.now();
    this.subscriptions.set(subscriptionId, sub);
    return true;
  }

  /**
   * Resume a paused subscription
   */
  resume(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub || sub.status !== 'paused') return false;

    sub.status = 'active';
    sub.updatedAt = Date.now();
    this.subscriptions.set(subscriptionId, sub);
    return true;
  }

  /**
   * Change subscription tier
   */
  changeTier(subscriptionId: string, newTierName: string, pricing: PricingModel): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;

    const tier = pricing.tiers?.find(t => t.name === newTierName);
    if (!tier) return false;

    sub.tierName = newTierName;
    sub.pricePerPeriod = tier.price;
    sub.updatedAt = Date.now();
    this.subscriptions.set(subscriptionId, sub);
    return true;
  }

  /**
   * Renew a subscription (called at period boundary)
   */
  renew(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;

    if (sub.cancelAtPeriodEnd) {
      sub.status = 'cancelled';
      sub.updatedAt = Date.now();
      this.subscriptions.set(subscriptionId, sub);
      return false;
    }

    const periodMs = this.getPeriodMs(sub.period);
    sub.currentPeriodStart = sub.currentPeriodEnd;
    sub.currentPeriodEnd = sub.currentPeriodStart + periodMs;
    sub.updatedAt = Date.now();
    this.subscriptions.set(subscriptionId, sub);
    return true;
  }

  /**
   * Get subscriptions for an account
   */
  getByAccount(accountId: string): Subscription[] {
    return Array.from(this.subscriptions.values()).filter(s => s.accountId === accountId);
  }

  /**
   * Get subscription for a specific service
   */
  getByService(accountId: string, serviceId: string): Subscription | undefined {
    return Array.from(this.subscriptions.values()).find(
      s => s.accountId === accountId && s.serviceId === serviceId && s.status !== 'cancelled'
    );
  }

  /**
   * Get active subscriptions count
   */
  getActiveCount(): number {
    return Array.from(this.subscriptions.values()).filter(s => s.status === 'active' || s.status === 'trial').length;
  }

  /**
   * Get subscriptions due for renewal
   */
  getDueForRenewal(): Subscription[] {
    const now = Date.now();
    return Array.from(this.subscriptions.values()).filter(
      s => s.status === 'active' && s.currentPeriodEnd <= now
    );
  }

  private getPeriodMs(period: BillingPeriod): number {
    switch (period) {
      case 'monthly': return 30 * 24 * 60 * 60 * 1000;
      case 'quarterly': return 90 * 24 * 60 * 60 * 1000;
      case 'annual': return 365 * 24 * 60 * 60 * 1000;
    }
  }
}

// ============================================================
// INVOICE GENERATOR
// ============================================================

export class InvoiceGenerator {
  private invoices: Map<string, Invoice> = new Map();
  private invoiceCounter = 0;

  /**
   * Generate an invoice for a billing period
   */
  generate(
    account: BillingAccount,
    subscriptions: Subscription[],
    usageTracker: UsageTracker,
    usagePricing: Map<string, UsagePricing[]>,
    periodStart: number,
    periodEnd: number
  ): Invoice {
    const lineItems: InvoiceLineItem[] = [];

    // Add subscription line items
    for (const sub of subscriptions) {
      if (sub.status === 'active' || sub.status === 'trial') {
        lineItems.push({
          serviceId: sub.serviceId,
          serviceName: sub.serviceId,
          description: `${sub.tierName} plan - ${sub.period} subscription`,
          type: 'subscription',
          quantity: 1,
          unitPrice: sub.status === 'trial' ? 0 : sub.pricePerPeriod,
          total: sub.status === 'trial' ? 0 : sub.pricePerPeriod,
        });
      }
    }

    // Add usage-based line items
    for (const [serviceId, pricingRules] of usagePricing) {
      const aggregated = usageTracker.getAggregatedUsage(account.id, serviceId, periodStart, periodEnd);

      for (const rule of pricingRules) {
        const usage = aggregated.get(rule.metric);
        if (usage) {
          const billableQuantity = Math.max(0, usage.total - rule.freeQuota);
          if (billableQuantity > 0) {
            lineItems.push({
              serviceId,
              serviceName: serviceId,
              description: `${rule.metric} usage (${usage.total} ${rule.unit}, ${rule.freeQuota} free)`,
              type: 'usage',
              quantity: billableQuantity,
              unitPrice: rule.pricePerUnit,
              total: Math.round(billableQuantity * rule.pricePerUnit),
              metric: rule.metric,
              freeQuotaUsed: Math.min(usage.total, rule.freeQuota),
            });
          }
        }
      }
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const taxRate = account.taxInfo?.exempt ? 0 : 0; // Tax calculation would integrate with tax service
    const tax = Math.round(subtotal * taxRate);
    const discount = 0; // Discount logic would be applied here
    const total = subtotal + tax - discount;

    const invoice: Invoice = {
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      accountId: account.id,
      invoiceNumber: `INV-${new Date().getFullYear()}-${String(++this.invoiceCounter).padStart(6, '0')}`,
      status: total === 0 ? 'paid' : 'open',
      periodStart,
      periodEnd,
      lineItems,
      subtotal,
      tax,
      discount,
      total,
      currency: account.currency,
      dueDate: periodEnd + (30 * 24 * 60 * 60 * 1000), // Net 30
      createdAt: Date.now(),
    };

    this.invoices.set(invoice.id, invoice);
    console.log(`[Billing] Invoice generated: ${invoice.invoiceNumber} for $${(total / 100).toFixed(2)}`);
    return invoice;
  }

  /**
   * Mark an invoice as paid
   */
  markPaid(invoiceId: string, paymentId: string): boolean {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return false;

    invoice.status = 'paid';
    invoice.paidDate = Date.now();
    invoice.paymentId = paymentId;
    this.invoices.set(invoiceId, invoice);
    return true;
  }

  /**
   * Void an invoice
   */
  voidInvoice(invoiceId: string): boolean {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.status === 'paid') return false;

    invoice.status = 'void';
    this.invoices.set(invoiceId, invoice);
    return true;
  }

  /**
   * Get invoices for an account
   */
  getByAccount(accountId: string): Invoice[] {
    return Array.from(this.invoices.values())
      .filter(i => i.accountId === accountId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get unpaid invoices
   */
  getUnpaid(): Invoice[] {
    return Array.from(this.invoices.values())
      .filter(i => i.status === 'open')
      .sort((a, b) => a.dueDate - b.dueDate);
  }

  /**
   * Get overdue invoices
   */
  getOverdue(): Invoice[] {
    const now = Date.now();
    return Array.from(this.invoices.values())
      .filter(i => i.status === 'open' && i.dueDate < now);
  }

  /**
   * Get total revenue for a period
   */
  getRevenue(startTime: number, endTime: number): { total: number; count: number } {
    const paid = Array.from(this.invoices.values())
      .filter(i => i.status === 'paid' && i.paidDate && i.paidDate >= startTime && i.paidDate <= endTime);

    return {
      total: paid.reduce((sum, i) => sum + i.total, 0),
      count: paid.length,
    };
  }
}

// ============================================================
// PAYMENT PROCESSOR
// ============================================================

export class PaymentProcessor {
  private payments: Map<string, Payment> = new Map();

  /**
   * Process a payment for an invoice
   */
  async processPayment(
    account: BillingAccount,
    invoice: Invoice,
    paymentMethod?: PaymentMethod
  ): Promise<Payment> {
    const method = paymentMethod || account.paymentMethod;
    if (!method) {
      throw new Error('No payment method available');
    }

    const payment: Payment = {
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      accountId: account.id,
      invoiceId: invoice.id,
      amount: invoice.total,
      currency: invoice.currency,
      status: 'processing',
      paymentMethod: method,
      createdAt: Date.now(),
    };

    this.payments.set(payment.id, payment);

    try {
      // In production, this would integrate with Stripe/PayPal/etc.
      console.log(`[Billing] Processing payment ${payment.id}: $${(payment.amount / 100).toFixed(2)}`);

      // Simulate payment processing
      payment.status = 'completed';
      payment.completedAt = Date.now();
      payment.gatewayReference = `gw_${Date.now()}`;
      this.payments.set(payment.id, payment);

      console.log(`[Billing] ✓ Payment completed: ${payment.id}`);
      return payment;
    } catch (error) {
      payment.status = 'failed';
      payment.failureReason = String(error);
      this.payments.set(payment.id, payment);
      throw error;
    }
  }

  /**
   * Process a refund
   */
  async processRefund(paymentId: string, amount?: number): Promise<Payment> {
    const original = this.payments.get(paymentId);
    if (!original || original.status !== 'completed') {
      throw new Error('Cannot refund: payment not found or not completed');
    }

    const refundAmount = amount || original.amount;
    if (refundAmount > original.amount) {
      throw new Error('Refund amount exceeds original payment');
    }

    const refund: Payment = {
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      accountId: original.accountId,
      invoiceId: original.invoiceId,
      amount: -refundAmount,
      currency: original.currency,
      status: 'completed',
      paymentMethod: original.paymentMethod,
      gatewayReference: `ref_${original.gatewayReference}`,
      createdAt: Date.now(),
      completedAt: Date.now(),
    };

    this.payments.set(refund.id, refund);

    original.status = 'refunded';
    this.payments.set(original.id, original);

    console.log(`[Billing] ✓ Refund processed: ${refund.id} for $${(refundAmount / 100).toFixed(2)}`);
    return refund;
  }

  /**
   * Get payments for an account
   */
  getByAccount(accountId: string): Payment[] {
    return Array.from(this.payments.values())
      .filter(p => p.accountId === accountId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get payment by ID
   */
  getPayment(paymentId: string): Payment | undefined {
    return this.payments.get(paymentId);
  }
}

// ============================================================
// BILLING SYSTEM (UNIFIED INTERFACE)
// ============================================================

export class BillingSystem {
  readonly usage: UsageTracker;
  readonly subscriptions: SubscriptionManager;
  readonly invoices: InvoiceGenerator;
  readonly payments: PaymentProcessor;

  private accounts: Map<string, BillingAccount> = new Map();
  private listeners: Map<string, Set<(event: BillingEvent) => void>> = new Map();

  constructor() {
    this.usage = new UsageTracker();
    this.subscriptions = new SubscriptionManager();
    this.invoices = new InvoiceGenerator();
    this.payments = new PaymentProcessor();
    console.log('[Billing] System initialized');
  }

  /**
   * Create a billing account
   */
  createAccount(ownerId: string, name: string, email: string, currency: string = 'USD'): BillingAccount {
    const account: BillingAccount = {
      id: `acct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ownerId,
      name,
      email,
      currency,
      balance: 0,
      creditLimit: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.accounts.set(account.id, account);
    console.log(`[Billing] Account created: ${account.id} for ${name}`);
    return account;
  }

  /**
   * Get a billing account
   */
  getAccount(accountId: string): BillingAccount | undefined {
    return this.accounts.get(accountId);
  }

  /**
   * Get account by owner ID
   */
  getAccountByOwner(ownerId: string): BillingAccount | undefined {
    return Array.from(this.accounts.values()).find(a => a.ownerId === ownerId);
  }

  /**
   * Subscribe to a service
   */
  subscribe(
    accountId: string,
    serviceId: string,
    pricing: PricingModel,
    tierName?: string,
    period?: BillingPeriod
  ): Subscription | null {
    const account = this.accounts.get(accountId);
    if (!account) return null;

    // Check for existing subscription
    const existing = this.subscriptions.getByService(accountId, serviceId);
    if (existing) return null;

    const subscription = this.subscriptions.create(accountId, serviceId, pricing, tierName, period);

    this.emit({
      type: 'billing:subscription.created',
      accountId,
      payload: { subscriptionId: subscription.id, serviceId, tierName },
      timestamp: Date.now(),
    });

    return subscription;
  }

  /**
   * Record usage for a service
   */
  recordUsage(accountId: string, serviceId: string, metric: string, quantity: number, unit: string): UsageRecord {
    const record = this.usage.record(accountId, serviceId, metric, quantity, unit);

    this.emit({
      type: 'billing:usage.recorded',
      accountId,
      payload: { serviceId, metric, quantity, unit },
      timestamp: Date.now(),
    });

    return record;
  }

  /**
   * Generate and process billing for an account
   */
  async processBilling(accountId: string, usagePricing: Map<string, UsagePricing[]>): Promise<Invoice | null> {
    const account = this.accounts.get(accountId);
    if (!account) return null;

    const subs = this.subscriptions.getByAccount(accountId);
    const activeSubs = subs.filter(s => s.status === 'active' || s.status === 'trial');

    if (activeSubs.length === 0) return null;

    // Use the earliest subscription period as the billing period
    const periodStart = Math.min(...activeSubs.map(s => s.currentPeriodStart));
    const periodEnd = Math.max(...activeSubs.map(s => s.currentPeriodEnd));

    const invoice = this.invoices.generate(account, activeSubs, this.usage, usagePricing, periodStart, periodEnd);

    this.emit({
      type: 'billing:invoice.created',
      accountId,
      payload: { invoiceId: invoice.id, total: invoice.total },
      timestamp: Date.now(),
    });

    // Auto-pay if payment method on file and total > 0
    if (invoice.total > 0 && account.paymentMethod) {
      try {
        const payment = await this.payments.processPayment(account, invoice);
        this.invoices.markPaid(invoice.id, payment.id);

        this.emit({
          type: 'billing:payment.completed',
          accountId,
          payload: { paymentId: payment.id, invoiceId: invoice.id, amount: payment.amount },
          timestamp: Date.now(),
        });

        // Renew subscriptions
        for (const sub of activeSubs) {
          this.subscriptions.renew(sub.id);
        }

        // Reset usage counters
        this.usage.resetPeriodCounters(accountId);
      } catch (error) {
        this.emit({
          type: 'billing:payment.failed',
          accountId,
          payload: { invoiceId: invoice.id, error: String(error) },
          timestamp: Date.now(),
        });
      }
    }

    return invoice;
  }

  /**
   * Get billing summary for an account
   */
  getBillingSummary(accountId: string): {
    account: BillingAccount | undefined;
    activeSubscriptions: Subscription[];
    recentInvoices: Invoice[];
    recentPayments: Payment[];
    currentUsage: Map<string, number>;
  } {
    return {
      account: this.accounts.get(accountId),
      activeSubscriptions: this.subscriptions.getByAccount(accountId).filter(s => s.status !== 'cancelled'),
      recentInvoices: this.invoices.getByAccount(accountId).slice(0, 10),
      recentPayments: this.payments.getByAccount(accountId).slice(0, 10),
      currentUsage: new Map(),
    };
  }

  // Event system
  on(type: string, handler: (event: BillingEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  private emit(event: BillingEvent): void {
    this.listeners.get(event.type)?.forEach(h => h(event));
    this.listeners.get('*')?.forEach(h => h(event));
  }
}