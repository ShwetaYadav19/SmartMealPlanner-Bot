// Razorpay payment adapter — handles UPI AutoPay subscriptions
// Uses Razorpay Subscriptions API for ₹49/month recurring payments

import * as https from 'https';
import type { PaymentProvider } from '../core/ports';

interface RazorpaySubscriptionResponse {
  id: string;
  short_url: string;
  status: string;
  current_end?: number;
  payment_method?: string;
}

export class RazorpayPaymentProvider implements PaymentProvider {
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly planId: string;
  private readonly webhookSecret: string;

  constructor(keyId: string, keySecret: string, planId: string, webhookSecret: string = '') {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.planId = planId;
    this.webhookSecret = webhookSecret;
  }

  async createSubscription(phoneNumber: string): Promise<{ subscriptionId: string; paymentLink: string }> {
    const body = JSON.stringify({
      plan_id: this.planId,
      total_count: 12, // 12 months max
      quantity: 1,
      customer_notify: 0, // We notify via WhatsApp ourselves
      notes: {
        phone_number: phoneNumber,
        source: 'smart_meal_planner_whatsapp',
      },
    });

    const response = await this.request<RazorpaySubscriptionResponse>('POST', '/v1/subscriptions', body);

    return {
      subscriptionId: response.id,
      paymentLink: response.short_url,
    };
  }

  async getSubscriptionStatus(subscriptionId: string): Promise<{
    status: 'active' | 'pending' | 'expired' | 'cancelled';
    paymentId?: string;
    currentPeriodEnd?: string;
  }> {
    const response = await this.request<RazorpaySubscriptionResponse>(
      'GET',
      `/v1/subscriptions/${subscriptionId}`,
    );

    const statusMap: Record<string, 'active' | 'pending' | 'expired' | 'cancelled'> = {
      created: 'pending',
      authenticated: 'pending',
      active: 'active',
      pending: 'pending',
      halted: 'expired',
      cancelled: 'cancelled',
      completed: 'expired',
      expired: 'expired',
    };

    return {
      status: statusMap[response.status] ?? 'pending',
      currentPeriodEnd: response.current_end
        ? new Date(response.current_end * 1000).toISOString()
        : undefined,
    };
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    const crypto = require('crypto');
    const secret = this.webhookSecret || this.keySecret;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  }

  private request<T>(method: string, path: string, body?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
      const options: https.RequestOptions = {
        hostname: 'api.razorpay.com',
        path,
        method,
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data) as T);
          } else {
            reject(new Error(`Razorpay API error ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }
}
