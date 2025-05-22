import { SSHClient, SSHConnectionConfig } from './ssh-client.js';
import { OSDetector, OSInfo } from './os-detector.js';

export interface PooledConnection {
  client: SSHClient;
  lastUsed: Date;
  host: string;
  username: string;
  osInfo?: OSInfo;
}

export class ConnectionPool {
  private connections = new Map<string, PooledConnection>();
  private readonly maxIdleTime = 10 * 60 * 1000; // 10 minutes
  private readonly cleanupInterval = 5 * 60 * 1000; // 5 minutes
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Get or create a connection to the specified host
   */
  async getConnection(host: string, config: SSHConnectionConfig): Promise<SSHClient> {
    const connectionKey = this.generateConnectionKey(host, config);
    
    // Check if we have an existing connection
    if (this.connections.has(connectionKey)) {
      const pooledConn = this.connections.get(connectionKey)!;
      
      // Test if connection is still alive with a health check
      if (await this.isConnectionHealthy(pooledConn.client)) {
        pooledConn.lastUsed = new Date();
        console.error(`♻️  Reusing SSH connection to ${host}`);
        return pooledConn.client;
      } else {
        // Connection is dead, remove it and close properly
        console.error(`🔄 Connection to ${host} is dead, removing from pool`);
        try {
          await pooledConn.client.disconnect();
        } catch (e) {
          // Ignore disconnect errors for dead connections
        }
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
    } catch (error) {
      console.error(`❌ Failed to connect to ${host}:`, error);
      throw error;
    }
  }

  /**
   * Explicitly disconnect and remove a connection from the pool
   */
  async removeConnection(host: string, config: SSHConnectionConfig): Promise<void> {
    const connectionKey = this.generateConnectionKey(host, config);
    
    if (this.connections.has(connectionKey)) {
      const pooledConn = this.connections.get(connectionKey)!;
      pooledConn.client.disconnect();
      this.connections.delete(connectionKey);
      console.error(`🔌 Disconnected and removed ${host} from connection pool`);
    }
  }

  /**
   * Get current pool status
   */
  getPoolStatus(): { totalConnections: number; activeConnections: number; connections: Array<{ host: string; username: string; lastUsed: Date; isConnected: boolean; osType?: string; shell?: string }> } {
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
  getOSInfo(host: string, config: SSHConnectionConfig): OSInfo | undefined {
    const connectionKey = this.generateConnectionKey(host, config);
    return this.connections.get(connectionKey)?.osInfo;
  }

  /**
   * Close all connections and clear the pool
   */
  async closeAll(): Promise<void> {
    console.error(`🧹 Closing all ${this.connections.size} pooled connections`);
    
    for (const [key, pooledConn] of this.connections) {
      try {
        pooledConn.client.disconnect();
      } catch (error) {
        console.warn(`Warning: Error closing connection ${key}:`, error);
      }
    }
    
    this.connections.clear();
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * Check if a connection is healthy by running a simple command
   */
  private async isConnectionHealthy(client: SSHClient): Promise<boolean> {
    try {
      // Check basic connection state first
      if (!client.connected) {
        return false;
      }
      
      // Try a simple command with short timeout
      const result = await Promise.race([
        client.executeCommand('echo "ping"'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 5000))
      ]) as any;
      
      return result.stdout?.trim() === 'ping';
    } catch (error) {
      console.error('Connection health check failed:', error);
      return false;
    }
  }

  /**
   * Generate a unique key for connection identification
   */
  private generateConnectionKey(host: string, config: SSHConnectionConfig): string {
    const port = config.port || 22;
    const keyIdentifier = config.privateKey || config.password || 'agent';
    return `${host}:${port}:${config.username}:${keyIdentifier}`;
  }

  /**
   * Clean up idle connections
   */
  private cleanup(): void {
    const now = new Date();
    const toRemove: string[] = [];

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
   * Disconnect a specific connection
   */
  async disconnect(host: string, config: SSHConnectionConfig): Promise<void> {
    const connectionKey = this.generateConnectionKey(host, config);
    
    if (this.connections.has(connectionKey)) {
      const pooledConn = this.connections.get(connectionKey)!;
      console.error(`🔌 Disconnecting SSH connection to ${host}`);
      
      try {
        await pooledConn.client.disconnect();
      } catch (error) {
        console.error(`Error disconnecting from ${host}:`, error);
      }
      
      this.connections.delete(connectionKey);
    }
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
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