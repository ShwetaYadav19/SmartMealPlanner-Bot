import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const THIRTY_ONE_DAYS_IN_SECONDS = 31 * 24 * 60 * 60;

export class DailyActivityRepository {
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

  /**
   * Records daily activity for a user. Returns true if this is the
   * user's first activity of the day, false if they were already active.
   */
  async recordActivity(phoneNumber: string, date: string): Promise<boolean> {
    const pk = `${phoneNumber}#${date}`;
    const ttl = Math.floor(Date.now() / 1000) + THIRTY_ONE_DAYS_IN_SECONDS;

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { pk, ttl },
          ConditionExpression: 'attribute_not_exists(pk)',
        })
      );
      return true;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.name === 'ConditionalCheckFailedException'
      ) {
        return false;
      }
      throw err;
    }
  }
}
