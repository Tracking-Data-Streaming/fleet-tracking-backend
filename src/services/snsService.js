const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TOPIC_ARN = process.env.SNS_ANTITHEFT_TOPIC_ARN;

/**
 * Publish an anti-theft alert to SNS → email subscriber.
 *
 * @param {Object} opts
 * @param {string} opts.deviceId
 * @param {string} opts.displayName
 * @param {number} opts.distance     — metres from geofence center
 * @param {number} opts.currentLat
 * @param {number} opts.currentLng
 * @param {number} opts.centerLat
 * @param {number} opts.centerLng
 * @param {number} opts.radius       — geofence radius in metres
 */
const sendAntitheftAlert = async ({
    deviceId,
    displayName,
    distance,
    currentLat,
    currentLng,
    centerLat,
    centerLng,
    radius,
}) => {
    if (!TOPIC_ARN) {
        console.warn('[SNS] SNS_ANTITHEFT_TOPIC_ARN not set — skipping email alert');
        return;
    }

    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
    const mapsUrl = `https://maps.google.com/?q=${currentLat},${currentLng}`;

    const subject = `🚨 Anti-theft Alert: ${displayName || deviceId} has moved!`;

    const message = [
        'ANTI-THEFT ALERT — IoT Asset Tracking System',
        '═══════════════════════════════════════════════',
        '',
        `Device     : ${displayName || deviceId} (${deviceId})`,
        `Time       : ${now} (GMT+7)`,
        '',
        `Geofence center : ${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}`,
        `Geofence radius : ${radius} m`,
        '',
        `Current position: ${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}`,
        `Distance moved  : ${distance.toFixed(1)} m  (threshold: ${radius} m)`,
        '',
        `📍 View on Google Maps: ${mapsUrl}`,
        '',
        '───────────────────────────────────────────────',
        'This alert was sent automatically by TrackingDATN.',
        'Disable anti-theft mode in the dashboard to stop alerts.',
    ].join('\n');

    const command = new PublishCommand({
        TopicArn: TOPIC_ARN,
        Subject: subject,
        Message: message,
    });

    await snsClient.send(command);
    console.log(`[SNS] Anti-theft alert sent for device: ${deviceId} (distance: ${distance.toFixed(1)}m)`);
};

module.exports = { sendAntitheftAlert };
