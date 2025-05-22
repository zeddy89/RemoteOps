import { SSHClient } from './ssh-client.js';
import { OSDetector } from './os-detector.js';
export class ConnectionPool {
    constructor() {
        this.connections = new Map();
        this.maxIdleTime = 10 * 60 * 1000; // 10 minutes
        this.cleanupInterval = 5 * 60 * 1000; // 5 minutes
        this.startCleanupTimer();
    }
    /**
     * Get or create a connection to the specified host
     */
    async getConnection(host, config) {
        const connectionKey = this.generateConnectionKey(host, config);
        // Check if we have an existing connection
        if (this.connections.has(connectionKey)) {
            const pooledConn = this.connections.get(connectionKey);
            // Test if connection is still alive
            if (pooledConn.client.connected) {
                pooledConn.lastUsed = new Date();
                console.error(`♻️  Reusing SSH connection to ${host}`);
                return pooledConn.client;
            }
            else {
                // Connection is dead, remove it
                console.error(`🔄 Connection to ${host} is dead, removing from pool`);
                this.connections.delete(connectionKey);
            }
        }
        // Create new connection
        console.error(`🔌 Creating new SSH connection to ${host}`);
        const client = new SSHClient(config);
        try {
            await client.connect();
            // Detect OS after successful connection
            console.error(`🔍 Detecting OS for ${host}...`);
            const osInfo = await OSDetector.detectOS(client, host);
            // Add to pool with OS info
            this.connections.set(connectionKey, {
                client,
                lastUsed: new Date(),
                host,
                username: config.username || 'unknown',
                osInfo
            });
            console.error(`✅ SSH connection to ${host} established and pooled (${osInfo.type} - ${osInfo.shell})`);
            return client;
        }
        catch (error) {
            console.error(`❌ Failed to connect to ${host}:`, error);
            throw error;
        }
    }
    /**
     * Explicitly disconnect and remove a connection from the pool
     */
    async removeConnection(host, config) {
        const connectionKey = this.generateConnectionKey(host, config);
        if (this.connections.has(connectionKey)) {
            const pooledConn = this.connections.get(connectionKey);
            pooledConn.client.disconnect();
            this.connections.delete(connectionKey);
            console.error(`🔌 Disconnected and removed ${host} from connection pool`);
        }
    }
    /**
     * Get current pool status
     */
    getPoolStatus() {
        const connections = Array.from(this.connections.values()).map(conn => ({
            host: conn.host,
            username: conn.username,
            lastUsed: conn.lastUsed,
            isConnected: conn.client.connected,
            osType: conn.osInfo?.type,
            shell: conn.osInfo?.shell
        }));
        return {
            totalConnections: this.connections.size,
            activeConnections: connections.filter(c => c.isConnected).length,
            connections
        };
    }
    /**
     * Get OS info for a specific connection
     */
    getOSInfo(host, config) {
        const connectionKey = this.generateConnectionKey(host, config);
        return this.connections.get(connectionKey)?.osInfo;
    }
    /**
     * Close all connections and clear the pool
     */
    async closeAll() {
        console.error(`🧹 Closing all ${this.connections.size} pooled connections`);
        for (const [key, pooledConn] of this.connections) {
            try {
                pooledConn.client.disconnect();
            }
            catch (error) {
                console.warn(`Warning: Error closing connection ${key}:`, error);
            }
        }
        this.connections.clear();
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
    }
    /**
     * Generate a unique key for connection identification
     */
    generateConnectionKey(host, config) {
        const port = config.port || 22;
        const keyIdentifier = config.privateKey || config.password || 'agent';
        return `${host}:${port}:${config.username}:${keyIdentifier}`;
    }
    /**
     * Clean up idle connections
     */
    cleanup() {
        const now = new Date();
        const toRemove = [];
        for (const [key, pooledConn] of this.connections) {
            const idleTime = now.getTime() - pooledConn.lastUsed.getTime();
            if (idleTime > this.maxIdleTime || !pooledConn.client.connected) {
                toRemove.push(key);
                pooledConn.client.disconnect();
                console.error(`🧹 Cleaned up idle connection to ${pooledConn.host} (idle for ${Math.round(idleTime / 1000)}s)`);
            }
        }
        toRemove.forEach(key => this.connections.delete(key));
    }
    /**
     * Start the cleanup timer
     */
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);
    }
}
// Singleton instance
export const connectionPool = new ConnectionPool();
// Graceful shutdown
process.on('SIGINT', async () => {
    console.error('🛑 Shutting down connection pool...');
    await connectionPool.closeAll();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.error('🛑 Shutting down connection pool...');
    await connectionPool.closeAll();
    process.exit(0);
});
