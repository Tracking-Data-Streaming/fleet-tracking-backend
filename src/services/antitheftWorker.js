const dynamoService = require('./dynamoService');
const locationService = require('./locationService');
const snsService = require('./snsService');
const { haversineDistanceM } = require('./geoUtils');

const WORKER_INTERVAL_MS = 15_000; // run every 15 seconds

let workerTimer = null;

/**
 * One pass of the anti-theft check.
 * - Fetches all devices with antitheftEnabled = true
 * - Compares current position to stored geofence center
 * - Publishes SNS alert on first exit, resets when device returns
 */
const runAntitheftCheck = async () => {
    let antitheftDevices;
    try {
        antitheftDevices = await dynamoService.getAntitheftEnabledDevices();
    } catch (err) {
        console.error('[AntitheftWorker] Failed to scan DynamoDB:', err.message);
        return;
    }

    if (!antitheftDevices.length) return; // nothing to check

    let positions;
    try {
        positions = await locationService.getDevicePositions();
    } catch (err) {
        console.error('[AntitheftWorker] Failed to fetch positions:', err.message);
        return;
    }

    const posMap = locationService.buildPositionMap(positions);

    for (const device of antitheftDevices) {
        const { deviceId, displayName, antitheftLat, antitheftLng, antitheftRadius, antitheftAlerted } = device;
        const pos = posMap[deviceId];

        if (!pos?.position) {
            console.log(`[AntitheftWorker] ${deviceId}: no position data yet, skipping`);
            continue;
        }

        const [currentLng, currentLat] = pos.position;
        const distance = haversineDistanceM(antitheftLat, antitheftLng, currentLat, currentLng);

        const isOutside = distance > antitheftRadius;

        if (isOutside && !antitheftAlerted) {
            // ── Device exited the geofence for the first time ──────────────────
            console.warn(`[AntitheftWorker] 🚨 ${deviceId} exited! Distance: ${distance.toFixed(1)}m`);

            // Mark alerted in DB first to prevent duplicate emails
            await dynamoService.setAntitheftAlerted(deviceId, true);

            // Send SNS email
            await snsService.sendAntitheftAlert({
                deviceId,
                displayName,
                distance,
                currentLat,
                currentLng,
                centerLat: antitheftLat,
                centerLng: antitheftLng,
                radius: antitheftRadius,
            });
        } else if (!isOutside && antitheftAlerted) {
            // ── Device returned inside the geofence ────────────────────────────
            console.log(`[AntitheftWorker] ✅ ${deviceId} returned. Distance: ${distance.toFixed(1)}m`);
            await dynamoService.setAntitheftAlerted(deviceId, false);
        } else {
            console.log(`[AntitheftWorker] ${deviceId}: ${distance.toFixed(1)}m — ${isOutside ? 'outside (alerted)' : 'inside OK'}`);
        }
    }
};

/**
 * Start the background worker.
 * Should be called once when the server starts.
 */
const startAntitheftWorker = () => {
    if (workerTimer) return; // already running

    console.log(`\n🛡️  Anti-theft worker started (interval: ${WORKER_INTERVAL_MS / 1000}s)\n`);

    // Run immediately, then on interval
    runAntitheftCheck();
    workerTimer = setInterval(runAntitheftCheck, WORKER_INTERVAL_MS);
};

/**
 * Stop the worker (useful for testing / graceful shutdown).
 */
const stopAntitheftWorker = () => {
    if (workerTimer) {
        clearInterval(workerTimer);
        workerTimer = null;
        console.log('[AntitheftWorker] Stopped.');
    }
};

module.exports = { startAntitheftWorker, stopAntitheftWorker, runAntitheftCheck };
