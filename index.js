require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');

const authRoutes = require('./src/routes/auth');
const deviceRoutes = require('./src/routes/devices');
const antitheftRoutes = require('./src/routes/antitheft');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const { requireAuth } = require('./src/middleware/auth');
const { startAntitheftWorker } = require('./src/services/antitheftWorker');
const { realtimeConfig } = require('./src/config/realtime');
const {
    APP_EVENTS_TOPIC_TEMPLATE,
    DEBUG_DEVICE_EVENTS_TOPIC_TEMPLATE,
    RAW_TELEMETRY_TOPIC_TEMPLATE,
    REALTIME_EVENT_TYPES,
    REALTIME_SCHEMA_VERSION,
    SAMPLE_REALTIME_EVENTS,
    validateRealtimeEnvelope,
} = require('./src/config/realtimeEventSchema');

const app = express();
const PORT = process.env.PORT || 3001;

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }
});

app.set('io', io);

io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    socket.on('join-room', (userId) => {
        if (userId) {
            socket.join(`user:${userId}`);
            console.log(`👤 Client ${socket.id} joined room user:${userId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────

// Security headers
app.use(helmet());

// CORS — restrict to frontend origin only
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Parse JSON body
app.use(express.json({ limit: '1mb' }));

// ─── ROUTES ───────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
    const sampleValidation = Object.fromEntries(
        Object.entries(SAMPLE_REALTIME_EVENTS).map(([name, event]) => [
            name,
            validateRealtimeEnvelope(event).valid,
        ])
    );

    res.json({
        status: 'ok',
        service: 'tracking-data-streaming-backend',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        rollout: {
            realtimeEnabled: realtimeConfig.enabled,
            realtimePublishEvents: realtimeConfig.publishEvents,
            realtimeAllowClientSubscribe: realtimeConfig.allowClientSubscribe,
            realtimeTransport: realtimeConfig.transport,
            realtimeFallbackPollIntervalMs: realtimeConfig.fallbackPollIntervalMs,
        },
        realtimeSchema: {
            version: REALTIME_SCHEMA_VERSION,
            eventTypes: Object.values(REALTIME_EVENT_TYPES),
            topics: {
                appEvents: APP_EVENTS_TOPIC_TEMPLATE,
                rawTelemetry: RAW_TELEMETRY_TOPIC_TEMPLATE,
                deviceDebug: DEBUG_DEVICE_EVENTS_TOPIC_TEMPLATE,
            },
            sampleValidation,
        },
    });
});

// Swagger Documentation API
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }', // Ẩn topbar mặc định cho đẹp
    customSiteTitle: 'VSmart API Docs',
}));

// Auth routes (public — no JWT required)
app.use('/api/auth', authRoutes);

// API routes (protected by JWT)
app.use('/api/devices', requireAuth, deviceRoutes);
app.use('/api/antitheft', requireAuth, antitheftRoutes);

// Webhook for AWS Lambda to publish real-time events
app.post('/api/realtime/event', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.REALTIME_WEBHOOK_KEY || 'vsmart_secret_telemetry_key';
    if (apiKey !== expectedKey) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const event = req.body;
    console.log(`✉️ Received real-time event from Lambda: ${event.type} for device ${event.deviceId}`);

    const io = req.app.get('io');
    if (io) {
        // Broadcast generally
        io.emit('realtime-event', event);

        // Targeted user broadcast
        const userId = event.userId;
        if (userId && userId !== 'unknown') {
            io.to(`user:${userId}`).emit('realtime-event', event);
            console.log(`   ↳ Broadcasted to user:${userId}`);
        }
    }

    return res.json({ success: true });
});

// ─── ERROR HANDLING ───────────────────────────────────────────────────────

// 404 for unmatched routes
app.use(notFoundHandler);

// Central error handler (MUST be last)
app.use(errorHandler);

// ─── START ────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
    console.log(`\n🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`   Environment  : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   DynamoDB     : ${process.env.DYNAMODB_DEVICES_TABLE || 'TrackingDATN-Devices'}`);
    console.log(`   Tracker      : ${process.env.LOCATION_TRACKER_NAME || 'TrackingDATN-Tracker'}`);
    console.log(`   SNS Topic    : ${process.env.SNS_ANTITHEFT_TOPIC_ARN || '(not set)'}`);
    console.log(`   CORS origin  : ${process.env.CORS_ORIGIN || 'http://localhost:5173'}\n`);
    console.log(`   Realtime     : Socket.io server integrated and running`);
    console.log(`   RT Webhook   : POST /api/realtime/event (API Key protected)\n`);

    // Start anti-theft background worker
    startAntitheftWorker();
});

module.exports = app; // for testing
