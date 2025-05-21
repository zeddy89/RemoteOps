import { Client, ClientChannel } from 'ssh2';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

export interface SSHConnectionConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string | Buffer;
  passphrase?: string;
  useAgent?: boolean;
  configFile?: string;
}

interface SSHConfigEntry {
  host: string;
  hostname?: string;
  port?: string;
  user?: string;
  identityfile?: string[];
}

export class SSHClient {
  private client: Client;
  private config: SSHConnectionConfig;
  private isConnected: boolean = false;

  constructor(config: SSHConnectionConfig) {
    this.client = new Client();
    this.config = {
      ...config,
      port: config.port || 22,
      username: config.username || os.userInfo().username,
      useAgent: config.useAgent !== undefined ? config.useAgent : true,
    };

    // If using config file, try to load settings
    if (this.config.configFile || !this.config.privateKey && !this.config.password) {
      const configSettings = this.loadSSHConfig(this.config.configFile);
      if (configSettings) {
        // Only apply settings that aren't already specified in the constructor
        if (!config.port && configSettings.port) {
          this.config.port = parseInt(configSettings.port, 10);
        }
        if (!config.username && configSettings.user) {
          this.config.username = configSettings.user;
        }
        if (!config.privateKey && configSettings.identityfile && configSettings.identityfile.length > 0) {
          // Try each identity file until we find one that exists
          for (const keyPath of configSettings.identityfile) {
            if (fs.existsSync(this.expandTilde(keyPath))) {
              this.config.privateKey = this.expandTilde(keyPath);
              break;
            }
          }
        }
      }
    }

    // If privateKey is a file path string, read the file
    if (typeof this.config.privateKey === 'string' && fs.existsSync(this.config.privateKey)) {
      this.config.privateKey = fs.readFileSync(this.config.privateKey);
    } else if (!this.config.privateKey && !this.config.password && !this.config.useAgent) {
      // Try common SSH key locations if no authentication method provided
      const keyPaths = [
        path.join(os.homedir(), '.ssh', 'id_rsa'),
        path.join(os.homedir(), '.ssh', 'id_ed25519'),
        path.join(os.homedir(), '.ssh', 'id_ecdsa'),
      ];
      
      for (const keyPath of keyPaths) {
        if (fs.existsSync(keyPath)) {
          this.config.privateKey = fs.readFileSync(keyPath);
          break;
        }
      }
    }
  }

  /**
   * Expand tilde (~) in paths to the user's home directory
   */
  private expandTilde(filePath: string): string {
    if (filePath.startsWith('~/') || filePath === '~') {
      return filePath.replace(/^~/, os.homedir());
    }
    return filePath;
  }

  /**
   * Load SSH config file and return settings for the current host
   */
  private loadSSHConfig(configFilePath?: string): SSHConfigEntry | null {
    const file = configFilePath || path.join(os.homedir(), '.ssh', 'config');
    
    if (!fs.existsSync(file)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      let currentHost: SSHConfigEntry | null = null;
      let matchedHost: SSHConfigEntry | null = null;
      
      // Parse the SSH config file
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line === '' || line.startsWith('#')) {
          continue;
        }
        
        const [key, ...valueParts] = line.split(/\s+/);
        const value = valueParts.join(' ');
        
        if (key.toLowerCase() === 'host') {
          // Check if the previous host matched our target
          if (currentHost && this.matchesHost(currentHost.host, this.config.host)) {
            matchedHost = currentHost;
            break;
          }
          
          // Start a new host entry
          currentHost = { host: value };
        } else if (currentHost) {
          // Add properties to the current host entry
          switch (key.toLowerCase()) {
            case 'hostname':
              currentHost.hostname = value;
              break;
            case 'port':
              currentHost.port = value;
              break;
            case 'user':
              currentHost.user = value;
              break;
            case 'identityfile':
              if (!currentHost.identityfile) {
                currentHost.identityfile = [];
              }
              currentHost.identityfile.push(value);
              break;
          }
        }
      }
      
      // Check the last host entry
      if (currentHost && this.matchesHost(currentHost.host, this.config.host) && !matchedHost) {
        matchedHost = currentHost;
      }
      
      return matchedHost;
    } catch (error) {
      console.error(`Error reading SSH config file: ${error}`);
      return null;
    }
  }
  
  /**
   * Check if a host pattern from SSH config matches the target host
   */
  private matchesHost(pattern: string, host: string): boolean {
    // Handle comma-separated patterns
    if (pattern.includes(',')) {
      return pattern.split(',').some(p => this.matchesHost(p.trim(), host));
    }
    
    // Convert SSH pattern to regex
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(host);
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    // Prepare connection config
    const connectionConfig: any = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
    };

    // Set up authentication method
    if (this.config.password) {
      // Password authentication
      connectionConfig.password = this.config.password;
    } else if (this.config.privateKey) {
      // Private key authentication
      connectionConfig.privateKey = this.config.privateKey;
      if (this.config.passphrase) {
        connectionConfig.passphrase = this.config.passphrase;
      }
    } else if (this.config.useAgent) {
      // Use SSH agent if available
      connectionConfig.agent = process.env.SSH_AUTH_SOCK;
      // Log info about SSH agent usage
      if (process.env.SSH_AUTH_SOCK) {
        console.log(`Using SSH agent at ${process.env.SSH_AUTH_SOCK}`);
      } else {
        console.log('SSH agent requested but SSH_AUTH_SOCK not found in environment');
      }
    }

    return new Promise((resolve, reject) => {
      this.client
        .on('ready', () => {
          this.isConnected = true;
          resolve();
        })
        .on('error', (err: Error) => {
          reject(new Error(`SSH connection error: ${err.message}`));
        })
        .connect(connectionConfig);
    });
  }

  async executeCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.client.exec(command, (err: Error | undefined, channel) => {
        if (err) {
          return reject(new Error(`Failed to execute command: ${err.message}`));
        }

        let stdout = '';
        let stderr = '';
        let exitCode: number = 0;

        channel
          .on('data', (data: Buffer) => {
            stdout += data.toString();
          })
          .on('stderr', (data: Buffer) => {
            stderr += data.toString();
          })
          .on('exit', (code: number) => {
            exitCode = code;
          })
          .on('close', () => {
            resolve({ stdout, stderr, code: exitCode });
          })
          .on('error', (err: Error) => {
            reject(new Error(`Channel error: ${err.message}`));
          });
      });
    });
  }

  async getInteractiveShell(): Promise<ClientChannel> {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.client.shell((err: Error | undefined, stream) => {
        if (err) {
          return reject(new Error(`Failed to open shell: ${err.message}`));
        }
        resolve(stream);
      });
    });
  }

  disconnect(): void {
    if (this.isConnected) {
      this.client.end();
      this.isConnected = false;
    }
  }
}