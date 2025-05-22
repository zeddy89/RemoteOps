import { SSHClient } from './ssh-client.js';

export interface DiagnosticResult {
  name: string;
  status: 'success' | 'warning' | 'error';
  output: string;
  details?: any;
}

export class DiagnosticRunner {
  private client: SSHClient;
  
  constructor(client: SSHClient) {
    this.client = client;
  }

  async runBasicSystemChecks(): Promise<DiagnosticResult[]> {
    const checks = [
      this.checkSystemInfo(),
      this.checkDiskSpace(),
      this.checkMemoryUsage(),
      this.checkCPULoad(),
      this.checkNetworkStatus(),
      this.checkProcessList(),
      this.checkPendingUpdates(),
    ];

    return Promise.all(checks);
  }
  
  async checkPendingUpdates(): Promise<DiagnosticResult> {
    try {
      // First, try to detect the package manager
      const { stdout: osInfo } = await this.client.executeCommand('cat /etc/os-release');
      
      let command = '';
      let parseOutput = (output: string): { status: 'success' | 'warning' | 'error', details: string } => {
        return { status: 'success', details: 'No updates available' };
      };
      
      if (osInfo.includes('ID=debian') || osInfo.includes('ID=ubuntu')) {
        // Debian/Ubuntu
        command = 'apt-get update -qq && apt-get --simulate upgrade';
        parseOutput = (output: string) => {
          if (output.includes('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded')) {
            return { status: 'success', details: 'No updates available' };
          } else {
            const upgradable = output.match(/(\d+) upgraded, (\d+) newly installed/);
            if (upgradable && upgradable[1] !== '0') {
              return { 
                status: 'warning', 
                details: `${upgradable[1]} packages can be upgraded` 
              };
            }
            return { status: 'success', details: 'System up to date' };
          }
        };
      } else if (osInfo.includes('ID="centos"') || osInfo.includes('ID="rhel"') || 
                 osInfo.includes('ID="fedora"') || osInfo.includes('ID="rocky"')) {
        // RHEL/CentOS/Fedora/Rocky
        command = 'dnf check-update -q';
        parseOutput = (output: string) => {
          if (output.trim() === '') {
            return { status: 'success', details: 'No updates available' };
          } else {
            const lines = output.trim().split('\\n').filter(line => line.trim() !== '');
            return { 
              status: 'warning', 
              details: `${lines.length} packages can be upgraded` 
            };
          }
        };
      } else if (osInfo.includes('ID=arch') || osInfo.includes('ID=manjaro')) {
        // Arch/Manjaro
        command = 'pacman -Qu';
        parseOutput = (output: string) => {
          if (output.trim() === '') {
            return { status: 'success', details: 'No updates available' };
          } else {
            const lines = output.trim().split('\\n').filter(line => line.trim() !== '');
            return { 
              status: 'warning', 
              details: `${lines.length} packages can be upgraded` 
            };
          }
        };
      } else {
        // Try to detect by checking which commands are available
        const { stdout: whichApt } = await this.client.executeCommand('which apt 2>/dev/null || echo "not found"');
        const { stdout: whichDnf } = await this.client.executeCommand('which dnf 2>/dev/null || echo "not found"');
        const { stdout: whichYum } = await this.client.executeCommand('which yum 2>/dev/null || echo "not found"');
        const { stdout: whichPacman } = await this.client.executeCommand('which pacman 2>/dev/null || echo "not found"');
        
        if (whichApt !== 'not found') {
          command = 'apt-get update -qq && apt-get --simulate upgrade';
          parseOutput = (output: string) => {
            if (output.includes('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded')) {
              return { status: 'success', details: 'No updates available' };
            } else {
              const upgradable = output.match(/(\d+) upgraded, (\d+) newly installed/);
              if (upgradable && upgradable[1] !== '0') {
                return { 
                  status: 'warning', 
                  details: `${upgradable[1]} packages can be upgraded` 
                };
              }
              return { status: 'success', details: 'System up to date' };
            }
          };
        } else if (whichDnf !== 'not found') {
          command = 'dnf check-update -q';
          parseOutput = (output: string) => {
            if (output.trim() === '') {
              return { status: 'success', details: 'No updates available' };
            } else {
              const lines = output.trim().split('\\n').filter(line => line.trim() !== '');
              return { 
                status: 'warning', 
                details: `${lines.length} packages can be upgraded` 
              };
            }
          };
        } else if (whichYum !== 'not found') {
          command = 'yum check-update -q';
          parseOutput = (output: string) => {
            if (output.trim() === '') {
              return { status: 'success', details: 'No updates available' };
            } else {
              const lines = output.trim().split('\\n').filter(line => line.trim() !== '');
              return { 
                status: 'warning', 
                details: `${lines.length} packages can be upgraded` 
              };
            }
          };
        } else if (whichPacman !== 'not found') {
          command = 'pacman -Qu';
          parseOutput = (output: string) => {
            if (output.trim() === '') {
              return { status: 'success', details: 'No updates available' };
            } else {
              const lines = output.trim().split('\\n').filter(line => line.trim() !== '');
              return { 
                status: 'warning', 
                details: `${lines.length} packages can be upgraded` 
              };
            }
          };
        } else {
          return {
            name: 'Pending Updates',
            status: 'error',
            output: 'Could not determine the package manager for this system'
          };
        }
      }
      
      const { stdout, stderr, code } = await this.client.executeCommand(command);
      const result = parseOutput(stdout);
      
      return {
        name: 'Pending Updates',
        status: result.status,
        output: stdout || stderr,
        details: result.details
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name: 'Pending Updates',
        status: 'error',
        output: `Failed to check for updates: ${errorMessage}`
      };
    }
  }

  async checkSystemInfo(): Promise<DiagnosticResult> {
    try {
      const { stdout, stderr, code } = await this.client.executeCommand('uname -a && hostname && uptime');
      
      return {
        name: 'System Information',
        status: code === 0 ? 'success' : 'error',
        output: stdout || stderr,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name: 'System Information',
        status: 'error',
        output: `Failed to get system information: ${errorMessage}`,
      };
    }
  }

  async checkDiskSpace(): Promise<DiagnosticResult> {
    try {
      const { stdout, stderr, code } = await this.client.executeCommand('df -h');
      
      const result: DiagnosticResult = {
        name: 'Disk Space',
        status: code === 0 ? 'success' : 'error',
        output: stdout || stderr,
      };
      
      // Check for any filesystem using more than 90% capacity
      if (stdout && stdout.match(/\d+%/g)?.some(usage => parseInt(usage, 10) >= 90)) {
        result.status = 'warning';
      }
      
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name: 'Disk Space',
        status: 'error',
        output: `Failed to check disk space: ${errorMessage}`,
      };
    }
  }

  async checkMemoryUsage(): Promise<DiagnosticResult> {
    try {
      const { stdout, stderr, code } = await this.client.executeCommand('free -h');
      
      const result: DiagnosticResult = {
        name: 'Memory Usage',
        status: code === 0 ? 'success' : 'error',
        output: stdout || stderr,
      };
      
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name: 'Memory Usage',
        status: 'error',
        output: `Failed to check memory usage: ${errorMessage}`,
      };
    }
  }

  async checkCPULoad(): Promise<DiagnosticResult> {
    try {
      const { stdout, stderr, code } = await this.client.executeCommand('top -bn1 | grep "Cpu(s)" && uptime');
      
      return {
        name: 'CPU Load',
        status: code === 0 ? 'success' : 'error',
        output: stdout || stderr,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name: 'CPU Load',
        status: 'error',
        output: `Failed to check CPU load: ${errorMessage}`,
      };
    }
  }

  async checkNetworkStatus(): Promise<DiagnosticResult> {
    try {
      const { stdout, stderr, code } = await this.client.executeCommand('ip addr && netstat -tuln');
      
      return {
        name: 'Network Status',
        status: code === 0 ? 'success' : 'error',
        output: stdout || stderr,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name: 'Network Status',
        status: 'error',
        output: `Failed to check network status: ${errorMessage}`,
      };
    }
  }

  async checkProcessList(): Promise<DiagnosticResult> {
    try {
      const { stdout, stderr, code } = await this.client.executeCommand('ps aux --sort=-%cpu | head -10');
      
      return {
        name: 'Top Processes',
        status: code === 0 ? 'success' : 'error',
        output: stdout || stderr,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name: 'Top Processes',
        status: 'error',
        output: `Failed to get process list: ${errorMessage}`,
      };
    }
  }

  async runCustomCommand(command: string, name: string): Promise<DiagnosticResult> {
    try {
      const { stdout, stderr, code } = await this.client.executeCommand(command);
      
      return {
        name,
        status: code === 0 ? 'success' : 'error',
        output: stdout || stderr,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name,
        status: 'error',
        output: `Failed to execute command: ${errorMessage}`,
      };
    }
  }
}