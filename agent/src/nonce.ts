import {
  DynamoDBClient,
  PutItemCommand,
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";

// Single-use guard for approval tokens. Consuming a nonce is a conditional
// write: it succeeds only if the finding id has never been applied. A replayed
// link (same token clicked twice) fails the condition and is rejected — so a
// fix can run at most once.
export async function consumeNonce(
  region: string,
  tableName: string,
  findingId: string,
  ttlSeconds: number
): Promise<boolean> {
  const ddb = new DynamoDBClient({ region });
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  try {
    await ddb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          finding_id: { S: findingId },
          applied_at: { N: String(Math.floor(Date.now() / 1000)) },
          expires_at: { N: String(expiresAt) },
        },
        ConditionExpression: "attribute_not_exists(finding_id)",
      })
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
}
