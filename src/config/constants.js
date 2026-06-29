module.exports = {
    DYNAMODB_DEVICES_TABLE: process.env.DYNAMODB_DEVICES_TABLE || 'TrackingDATN-Devices',
    LOCATION_TRACKER_NAME: process.env.LOCATION_TRACKER_NAME || 'TrackingDATN-Tracker',
    GEOFENCE: process.env.LOCATION_GEOFENCE_COLLECTION || 'TrackingDATN-GeofenceCollection',

    // Allowed device types
    DEVICE_TYPES: ['truck', 'car', 'motorbike', 'van', 'bus', 'other'],

    // Allowed device statuses
    DEVICE_STATUSES: ['active', 'inactive', 'maintenance'],
};
