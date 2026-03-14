// Port interfaces — zero imports from adapters, WhatsApp, Twilio, or AWS modules
import type { Meal, MealFilter, UserState } from './types';

export interface ButtonOption {
  id: string;
  title: string;
}

export interface MessagingProvider {
  sendTextMessage(to: string, body: string): Promise<void>;
  sendButtonMessage(
    to: string,
    body: string,
    buttons: ButtonOption[],
    templatePurpose?: string
  ): Promise<void>;
}

export interface MealRepository {
  getMeals(filter: MealFilter): Promise<Meal[]>;
  getMealById(id: string): Promise<Meal | null>;
}

export interface UserStateRepository {
  getUser(phoneNumber: string): Promise<UserState | null>;
  saveUser(state: UserState): Promise<void>;
  scanOnboardedUsers(): Promise<UserState[]>;
}
