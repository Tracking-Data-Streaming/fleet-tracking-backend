require('dotenv').config();

const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamoDBDocumentClient } = require('../src/config/aws');
const { DYNAMODB_DEVICES_TABLE } = require('../src/config/constants');

async function backfillDeviceOwners() {
    const ownerUserId = process.argv[2] || process.env.BACKFILL_OWNER_USER_ID;
    if (!ownerUserId) {
        throw new Error('Missing ownerUserId. Usage: node scripts/backfill-device-owners.js <cognito-sub>');
    }

    const response = await dynamoDBDocumentClient.send(new ScanCommand({
        TableName: DYNAMODB_DEVICES_TABLE,
        ProjectionExpression: 'deviceId, ownerUserId',
    }));

    const devices = response.Items || [];
    const missingOwners = devices.filter((device) => !device.ownerUserId);

    console.log(`[Backfill] Found ${devices.length} devices, ${missingOwners.length} missing ownerUserId`);

    for (const device of missingOwners) {
        await dynamoDBDocumentClient.send(new UpdateCommand({
            TableName: DYNAMODB_DEVICES_TABLE,
            Key: { deviceId: device.deviceId },
            UpdateExpression: 'SET ownerUserId = :owner, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':owner': ownerUserId,
                ':updatedAt': new Date().toISOString(),
            },
            ConditionExpression: 'attribute_exists(deviceId)',
        }));

        console.log(`[Backfill] Updated ${device.deviceId} -> ${ownerUserId}`);
    }

    console.log('[Backfill] Done');
}

backfillDeviceOwners().catch((error) => {
    console.error('[Backfill] Failed:', error.message);
    process.exit(1);
});
