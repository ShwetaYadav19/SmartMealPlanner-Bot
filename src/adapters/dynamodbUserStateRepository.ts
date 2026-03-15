import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { UserStateRepository } from '../core/ports';
import type { UserState } from '../core/types';

export class DynamoDBUserStateRepository implements UserStateRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(tableName: string, client?: DynamoDBDocumentClient) {
    this.tableName = tableName;
    this.docClient =
      client ??
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      });
  }

  async getUser(phoneNumber: string): Promise<UserState | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { phoneNumber },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.deserialize(result.Item);
  }

  async saveUser(state: UserState): Promise<void> {
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.serialize(state),
      })
    );
  }

  async scanOnboardedUsers(): Promise<UserState[]> {
    const users: UserState[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'onboardingComplete = :true',
          ExpressionAttributeValues: { ':true': true },
          ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
        })
      );

      if (result.Items) {
        for (const item of result.Items) {
          users.push(this.deserialize(item as Record<string, unknown>));
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    return users;
  }


  private serialize(state: UserState): Record<string, unknown> {
    const item: Record<string, unknown> = {
      phoneNumber: state.phoneNumber,
      onboardingComplete: state.onboardingComplete,
      conversationState: state.conversationState,
    };

    if (state.cuisinePreference !== undefined) {
      item.cuisinePreference = state.cuisinePreference;
    }
    if (state.dietPreference !== undefined) {
      item.dietPreference = state.dietPreference;
    }
    if (state.mealStyle !== undefined) {
      item.mealStyle = state.mealStyle;
    }
    if (state.weeklyPlan !== undefined) {
      item.weeklyPlan = state.weeklyPlan;
    }
    if (state.weeklyPlanStartDate !== undefined) {
      item.weeklyPlanStartDate = state.weeklyPlanStartDate;
    }
    if (state.cookPhoneNumber !== undefined) {
      item.cookPhoneNumber = state.cookPhoneNumber;
    }
    if (state.excludedDishIds !== undefined) {
      item.excludedDishIds = state.excludedDishIds;
    }
    if (state.candidateDishes !== undefined) {
      item.candidateDishes = state.candidateDishes;
    }
    if (state.isPreferenceChange !== undefined) {
      item.isPreferenceChange = state.isPreferenceChange;
    }

    return item;
  }

  private deserialize(item: Record<string, unknown>): UserState {
    const state: UserState = {
      phoneNumber: item.phoneNumber as string,
      onboardingComplete: item.onboardingComplete as boolean,
      conversationState: item.conversationState as UserState['conversationState'],
    };

    if (item.cuisinePreference !== undefined) {
      state.cuisinePreference = item.cuisinePreference as UserState['cuisinePreference'];
    }
    if (item.dietPreference !== undefined) {
      state.dietPreference = item.dietPreference as UserState['dietPreference'];
    }
    if (item.mealStyle !== undefined) {
      state.mealStyle = item.mealStyle as UserState['mealStyle'];
    }
    if (item.weeklyPlan !== undefined) {
      state.weeklyPlan = item.weeklyPlan as UserState['weeklyPlan'];
    }
    if (item.weeklyPlanStartDate !== undefined) {
      state.weeklyPlanStartDate = item.weeklyPlanStartDate as string;
    }
    if (item.cookPhoneNumber !== undefined) {
      state.cookPhoneNumber = item.cookPhoneNumber as string;
    }
    if (item.excludedDishIds !== undefined) {
      state.excludedDishIds = item.excludedDishIds as string[];
    }
    if (item.candidateDishes !== undefined) {
      state.candidateDishes = item.candidateDishes as UserState['candidateDishes'];
    }
    if (item.isPreferenceChange !== undefined) {
      state.isPreferenceChange = item.isPreferenceChange as boolean;
    }

    return state;
  }
}
