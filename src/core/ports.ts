// Port interfaces — zero imports from adapters, WhatsApp, Twilio, or AWS modules
import type { Meal, MealFilter, MealComponent, MealComponentFilter, UserState, Rule, CuratedPool } from './types';

export interface ButtonOption {
  id: string;
  title: string;
}

export interface ListItem {
  id: string;
  item: string;
  description?: string;
}

export interface MessagingProvider {
  sendTextMessage(to: string, body: string, contentSid?: string, contentVariables?: Record<string, string>): Promise<void>;
  sendImageMessage(to: string, imageUrl: string, caption?: string): Promise<void>;
  sendButtonMessage(
    to: string,
    body: string,
    buttons: ButtonOption[],
    contentSid?: string,
    listItemCount?: number,
    contentVariables?: Record<string, string>,
  ): Promise<void>;
  sendListMessage(
    to: string,
    body: string,
    buttonLabel: string,
    items: ListItem[],
  ): Promise<void>;
}

export interface MealRepository {
  getMeals(filter: MealFilter): Promise<Meal[]>;
  getMealById(id: string): Promise<Meal | null>;
}

export interface MealComponentRepository {
  getComponents(filter: MealComponentFilter): Promise<MealComponent[]>;
}

export interface UserStateRepository {
  getUser(phoneNumber: string): Promise<UserState | null>;
  saveUser(state: UserState): Promise<void>;
  scanOnboardedUsers(): Promise<UserState[]>;
}

export interface RulesRepository {
  getRules(): Promise<Rule[]>;
}

export interface CuratedPoolRepository {
  getPool(cuisine: string, diet: string, style: string): CuratedPool | null;
}

export interface PaymentProvider {
  createSubscription(phoneNumber: string): Promise<{ subscriptionId: string; paymentLink: string }>;
  getSubscriptionStatus(subscriptionId: string): Promise<{ status: 'active' | 'pending' | 'expired' | 'cancelled'; paymentId?: string; currentPeriodEnd?: string }>;
  verifyWebhookSignature(body: string, signature: string): boolean;
}
