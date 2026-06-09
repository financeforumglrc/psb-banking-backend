/**
 * WebSocket Service
 * Real-time notifications and live updates
 */

let WebSocket;
try {
    WebSocket = require('ws');
} catch (e) {
    console.warn('ws not installed. WebSocket service disabled.');
}

const jwt = require('jsonwebtoken');

class WebSocketService {
    constructor(server) {
        if (!WebSocket) {
            this.wss = null;
            this.clients = new Map();
            console.warn('WebSocket service not available - ws module not installed');
            return;
        }
        this.wss = new WebSocket.Server({ server });
        this.clients = new Map(); // userId -> Set of ws connections
        this.setupHandlers();
    }

    setupHandlers() {
        this.wss.on('connection', (ws, req) => {
            console.log('WebSocket connection established');
            
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    
                    if (data.type === 'auth') {
                        const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
                        ws.userId = decoded.id;
                        // Track multiple connections per user
                        if (!this.clients.has(decoded.id)) {
                            this.clients.set(decoded.id, new Set());
                        }
                        this.clients.get(decoded.id).add(ws);
                        ws.send(JSON.stringify({
                            type: 'auth_success',
                            message: 'Connected to DS Financial Real-Time'
                        }));
                    }
                    
                    if (data.type === 'subscribe') {
                        ws.subscriptions = ws.subscriptions || [];
                        ws.subscriptions.push(data.channel);
                        ws.send(JSON.stringify({
                            type: 'subscribed',
                            channel: data.channel
                        }));
                    }
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error.message
                    }));
                }
            });

            ws.on('close', () => {
                if (ws.userId && this.clients.has(ws.userId)) {
                    const userConnections = this.clients.get(ws.userId);
                    userConnections.delete(ws);
                    if (userConnections.size === 0) {
                        this.clients.delete(ws.userId);
                    }
                }
            });
        });
    }

    notifyUser(userId, data) {
        const connections = this.clients.get(userId);
        if (!connections) return;
        const payload = JSON.stringify(data);
        connections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(payload);
            }
        });
    }

    broadcast(channel, data) {
        if (!this.wss) return;
        this.wss.clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN && 
                ws.subscriptions?.includes(channel)) {
                ws.send(JSON.stringify({ channel, ...data }));
            }
        });
    }

    notifyCalculationComplete(userId, calculation) {
        this.notifyUser(userId, {
            type: 'calculation_complete',
            patent: calculation.patent,
            result: calculation.outputs
        });
    }

    notifyPatentUsage(userId, patentId) {
        this.notifyUser(userId, {
            type: 'patent_used',
            patent: patentId,
            timestamp: new Date().toISOString()
        });
    }

    notifyGSTUpdate(userId, update) {
        this.notifyUser(userId, {
            type: 'gst_update',
            update
        });
    }
}

module.exports = WebSocketService;
