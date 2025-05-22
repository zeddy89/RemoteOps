export class OSDetector {
    /**
     * Detect the operating system of a remote host
     */
    static async detectOS(client, host) {
        // Check cache first
        if (this.cache.has(host)) {
            const cached = this.cache.get(host);
            // Cache for 1 hour
            if (Date.now() - cached.detected.getTime() < 3600000) {
                return cached;
            }
        }
        console.error(`🔍 Detecting OS for ${host}...`);
        try {
            // Try Windows detection first (most specific)
            const windowsResult = await this.tryWindowsDetection(client);
            if (windowsResult) {
                this.cache.set(host, windowsResult);
                console.error(`🪟 Detected Windows on ${host}: ${windowsResult.version}`);
                return windowsResult;
            }
            // Try Linux detection
            const linuxResult = await this.tryLinuxDetection(client);
            if (linuxResult) {
                this.cache.set(host, linuxResult);
                console.error(`🐧 Detected Linux on ${host}: ${linuxResult.version}`);
                return linuxResult;
            }
            // Try generic Unix detection
            const unixResult = await this.tryUnixDetection(client);
            if (unixResult) {
                this.cache.set(host, unixResult);
                console.error(`🖥️  Detected Unix on ${host}: ${unixResult.version}`);
                return unixResult;
            }
            // Fallback to unknown
            const unknownResult = {
                type: 'unknown',
                shell: 'sh',
                detected: new Date()
            };
            this.cache.set(host, unknownResult);
            console.error(`❓ Unknown OS detected on ${host}, using generic shell`);
            return unknownResult;
        }
        catch (error) {
            console.error(`❌ OS detection failed for ${host}:`, error);
            const fallbackResult = {
                type: 'unknown',
                shell: 'sh',
                detected: new Date()
            };
            this.cache.set(host, fallbackResult);
            return fallbackResult;
        }
    }
    /**
     * Try to detect Windows
     */
    static async tryWindowsDetection(client) {
        try {
            // Try systeminfo command (Windows specific)
            const result = await client.executeCommand('systeminfo | findstr /C:"OS Name" /C:"OS Version" /C:"System Type"');
            if (result.code === 0 && result.stdout.toLowerCase().includes('windows')) {
                const lines = result.stdout.split('\n');
                let version = 'Unknown';
                let architecture = 'Unknown';
                for (const line of lines) {
                    if (line.includes('OS Name')) {
                        version = line.split(':')[1]?.trim() || 'Unknown';
                    }
                    if (line.includes('System Type')) {
                        architecture = line.split(':')[1]?.trim() || 'Unknown';
                    }
                }
                return {
                    type: 'windows',
                    version,
                    architecture,
                    shell: 'powershell',
                    detected: new Date()
                };
            }
        }
        catch (error) {
            // Windows detection failed, try alternative
            try {
                const altResult = await client.executeCommand('echo %OS%');
                if (altResult.code === 0 && altResult.stdout.toLowerCase().includes('windows')) {
                    return {
                        type: 'windows',
                        version: 'Windows (detected via %OS%)',
                        shell: 'cmd',
                        detected: new Date()
                    };
                }
            }
            catch (altError) {
                // Both methods failed
            }
        }
        return null;
    }
    /**
     * Try to detect Linux
     */
    static async tryLinuxDetection(client) {
        try {
            // Try to read /etc/os-release (modern standard)
            const result = await client.executeCommand('cat /etc/os-release 2>/dev/null || cat /etc/lsb-release 2>/dev/null || echo "ID=linux"');
            if (result.code === 0) {
                const output = result.stdout.toLowerCase();
                if (output.includes('id=') || output.includes('name=')) {
                    let version = 'Linux';
                    let architecture = 'Unknown';
                    // Extract distribution info
                    const lines = result.stdout.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('PRETTY_NAME=')) {
                            version = line.split('=')[1]?.replace(/"/g, '').trim() || version;
                        }
                        else if (line.startsWith('NAME=') && version === 'Linux') {
                            version = line.split('=')[1]?.replace(/"/g, '').trim() || version;
                        }
                    }
                    // Get architecture
                    try {
                        const archResult = await client.executeCommand('uname -m');
                        if (archResult.code === 0) {
                            architecture = archResult.stdout.trim();
                        }
                    }
                    catch (archError) {
                        // Architecture detection failed, continue
                    }
                    return {
                        type: 'linux',
                        version,
                        architecture,
                        shell: 'bash',
                        detected: new Date()
                    };
                }
            }
        }
        catch (error) {
            // Linux detection failed
        }
        return null;
    }
    /**
     * Try to detect generic Unix
     */
    static async tryUnixDetection(client) {
        try {
            const result = await client.executeCommand('uname -s 2>/dev/null');
            if (result.code === 0 && result.stdout.trim()) {
                const osName = result.stdout.trim();
                let architecture = 'Unknown';
                // Get architecture
                try {
                    const archResult = await client.executeCommand('uname -m');
                    if (archResult.code === 0) {
                        architecture = archResult.stdout.trim();
                    }
                }
                catch (archError) {
                    // Architecture detection failed, continue
                }
                return {
                    type: 'unix',
                    version: osName,
                    architecture,
                    shell: 'bash',
                    detected: new Date()
                };
            }
        }
        catch (error) {
            // Unix detection failed
        }
        return null;
    }
    /**
     * Get appropriate command for the detected OS
     */
    static formatCommand(osInfo, command) {
        switch (osInfo.shell) {
            case 'powershell':
                // Wrap command in PowerShell if it's not already
                if (!command.toLowerCase().startsWith('powershell')) {
                    return `powershell "${command.replace(/"/g, '\\"')}"`;
                }
                return command;
            case 'cmd':
                // Use cmd for older Windows systems
                return command;
            case 'bash':
            case 'sh':
            default:
                // Use as-is for Unix-like systems
                return command;
        }
    }
    /**
     * Get system info command for the detected OS
     */
    static getSystemInfoCommand(osInfo) {
        switch (osInfo.type) {
            case 'windows':
                return 'systeminfo';
            case 'linux':
            case 'unix':
                return 'uname -a && hostname && uptime';
            default:
                return 'echo "System: $(uname -s 2>/dev/null || echo Unknown)"';
        }
    }
    /**
     * Get disk space command for the detected OS
     */
    static getDiskSpaceCommand(osInfo) {
        switch (osInfo.type) {
            case 'windows':
                return 'powershell "Get-WmiObject Win32_LogicalDisk | Select-Object DeviceID, @{Name=\'Size(GB)\';Expression={[math]::Round($_.Size/1GB,2)}}, @{Name=\'FreeSpace(GB)\';Expression={[math]::Round($_.FreeSpace/1GB,2)}}, @{Name=\'%Free\';Expression={[math]::Round(($_.FreeSpace/$_.Size)*100,2)}}"';
            case 'linux':
            case 'unix':
            default:
                return 'df -h';
        }
    }
    /**
     * Get memory usage command for the detected OS
     */
    static getMemoryCommand(osInfo) {
        switch (osInfo.type) {
            case 'windows':
                return 'powershell "Get-WmiObject Win32_OperatingSystem | Select-Object @{Name=\'TotalMemory(GB)\';Expression={[math]::Round($_.TotalVisibleMemorySize/1MB,2)}}, @{Name=\'FreeMemory(GB)\';Expression={[math]::Round($_.FreePhysicalMemory/1MB,2)}}, @{Name=\'UsedMemory(GB)\';Expression={[math]::Round(($_.TotalVisibleMemorySize-$_.FreePhysicalMemory)/1MB,2)}}"';
            case 'linux':
            case 'unix':
            default:
                return 'free -h';
        }
    }
    /**
     * Get CPU usage command for the detected OS
     */
    static getCPUCommand(osInfo) {
        switch (osInfo.type) {
            case 'windows':
                return 'powershell "Get-Counter \'\\Processor(_Total)\\% Processor Time\' -SampleInterval 1 -MaxSamples 1 | Select-Object -ExpandProperty CounterSamples | Select-Object CookedValue"';
            case 'linux':
            case 'unix':
            default:
                return 'top -bn1 | grep "Cpu(s)" || uptime';
        }
    }
    /**
     * Get top processes command for the detected OS
     */
    static getTopProcessesCommand(osInfo) {
        switch (osInfo.type) {
            case 'windows':
                return 'powershell "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, @{Name=\'CPU(s)\';Expression={$_.CPU}}, @{Name=\'Memory(MB)\';Expression={[math]::Round($_.WorkingSet/1MB,2)}} | Format-Table -AutoSize"';
            case 'linux':
            case 'unix':
            default:
                return 'ps aux --sort=-pcpu | head -11';
        }
    }
    /**
     * Clear OS detection cache (useful for testing)
     */
    static clearCache() {
        this.cache.clear();
    }
}
OSDetector.cache = new Map();
