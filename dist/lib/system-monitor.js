export class SystemMonitor {
    constructor(client, osInfo) {
        this.client = client;
        this.osInfo = osInfo;
    }
    /**
     * Get comprehensive system metrics
     */
    async getSystemMetrics(host) {
        console.error(`📊 Collecting system metrics for ${host}...`);
        const [cpu, memory, disk, network, processes] = await Promise.all([
            this.getCPUMetrics(),
            this.getMemoryMetrics(),
            this.getDiskMetrics(),
            this.getNetworkMetrics(),
            this.getTopProcesses(10)
        ]);
        return {
            timestamp: new Date(),
            host,
            cpu,
            memory,
            disk,
            network,
            processes
        };
    }
    /**
     * Get CPU metrics
     */
    async getCPUMetrics() {
        try {
            if (this.osInfo.type === 'windows') {
                return await this.getWindowsCPUMetrics();
            }
            else {
                return await this.getLinuxCPUMetrics();
            }
        }
        catch (error) {
            console.error('Failed to get CPU metrics:', error);
            return { usage: 0, cores: 1 };
        }
    }
    async getWindowsCPUMetrics() {
        const cpuCommand = `powershell "
      $cpu = Get-Counter '\\\\Processor(_Total)\\\\% Processor Time' -SampleInterval 1 -MaxSamples 1
      $cores = (Get-WmiObject Win32_ComputerSystem).NumberOfLogicalProcessors
      Write-Output \"Usage:$($cpu.CounterSamples[0].CookedValue)\"
      Write-Output \"Cores:$cores\"
    "`;
        const result = await this.client.executeCommand(cpuCommand);
        const lines = result.stdout.split('\n');
        let usage = 0;
        let cores = 1;
        for (const line of lines) {
            if (line.startsWith('Usage:')) {
                usage = parseFloat(line.split(':')[1]) || 0;
            }
            else if (line.startsWith('Cores:')) {
                cores = parseInt(line.split(':')[1]) || 1;
            }
        }
        return { usage: Math.round(usage * 100) / 100, cores };
    }
    async getLinuxCPUMetrics() {
        // Get CPU usage using top
        const cpuCommand = `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`;
        const coreCommand = `nproc`;
        const loadCommand = `uptime | awk -F'load average:' '{print $2}' | sed 's/,//g'`;
        const [cpuResult, coreResult, loadResult] = await Promise.all([
            this.client.executeCommand(cpuCommand),
            this.client.executeCommand(coreCommand),
            this.client.executeCommand(loadCommand)
        ]);
        const usage = parseFloat(cpuResult.stdout.trim()) || 0;
        const cores = parseInt(coreResult.stdout.trim()) || 1;
        const loadStr = loadResult.stdout.trim();
        const loadAverage = loadStr ? loadStr.split(/\s+/).map(x => parseFloat(x)).filter(x => !isNaN(x)) : undefined;
        return { usage, cores, loadAverage };
    }
    /**
     * Get memory metrics
     */
    async getMemoryMetrics() {
        try {
            if (this.osInfo.type === 'windows') {
                return await this.getWindowsMemoryMetrics();
            }
            else {
                return await this.getLinuxMemoryMetrics();
            }
        }
        catch (error) {
            console.error('Failed to get memory metrics:', error);
            return { total: 0, used: 0, free: 0, available: 0, percentage: 0 };
        }
    }
    async getWindowsMemoryMetrics() {
        const memCommand = `powershell "
      $os = Get-WmiObject Win32_OperatingSystem
      $total = [math]::Round($os.TotalVisibleMemorySize / 1024, 2)
      $free = [math]::Round($os.FreePhysicalMemory / 1024, 2)
      $used = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1024, 2)
      $percentage = [math]::Round(($used / $total) * 100, 2)
      Write-Output \"Total:$total\"
      Write-Output \"Used:$used\"
      Write-Output \"Free:$free\"
      Write-Output \"Percentage:$percentage\"
    "`;
        const result = await this.client.executeCommand(memCommand);
        const lines = result.stdout.split('\n');
        let total = 0, used = 0, free = 0, percentage = 0;
        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length === 2) {
                const value = parseFloat(parts[1]) || 0;
                switch (parts[0]) {
                    case 'Total':
                        total = value;
                        break;
                    case 'Used':
                        used = value;
                        break;
                    case 'Free':
                        free = value;
                        break;
                    case 'Percentage':
                        percentage = value;
                        break;
                }
            }
        }
        return { total, used, free, available: free, percentage };
    }
    async getLinuxMemoryMetrics() {
        const result = await this.client.executeCommand(`free -m | grep -E '^Mem:'`);
        const parts = result.stdout.trim().split(/\s+/);
        if (parts.length >= 7) {
            const total = parseInt(parts[1]) || 0;
            const used = parseInt(parts[2]) || 0;
            const free = parseInt(parts[3]) || 0;
            const available = parseInt(parts[6]) || free;
            const percentage = total > 0 ? Math.round((used / total) * 100 * 100) / 100 : 0;
            return { total, used, free, available, percentage };
        }
        return { total: 0, used: 0, free: 0, available: 0, percentage: 0 };
    }
    /**
     * Get disk metrics
     */
    async getDiskMetrics() {
        try {
            if (this.osInfo.type === 'windows') {
                return await this.getWindowsDiskMetrics();
            }
            else {
                return await this.getLinuxDiskMetrics();
            }
        }
        catch (error) {
            console.error('Failed to get disk metrics:', error);
            return [];
        }
    }
    async getWindowsDiskMetrics() {
        const diskCommand = `powershell "
      Get-WmiObject Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | ForEach-Object {
        $total = [math]::Round($_.Size / 1GB, 2)
        $free = [math]::Round($_.FreeSpace / 1GB, 2)
        $used = [math]::Round(($_.Size - $_.FreeSpace) / 1GB, 2)
        $percentage = if($total -gt 0) { [math]::Round(($used / $total) * 100, 2) } else { 0 }
        Write-Output \"$($_.DeviceID)|$total|$used|$free|$percentage|$($_.DeviceID)\"
      }
    "`;
        const result = await this.client.executeCommand(diskCommand);
        const disks = [];
        for (const line of result.stdout.split('\n')) {
            if (line.trim() && line.includes('|')) {
                const parts = line.trim().split('|');
                if (parts.length >= 6) {
                    disks.push({
                        device: parts[0],
                        total: parseFloat(parts[1]) || 0,
                        used: parseFloat(parts[2]) || 0,
                        free: parseFloat(parts[3]) || 0,
                        percentage: parseFloat(parts[4]) || 0,
                        mountPoint: parts[5]
                    });
                }
            }
        }
        return disks;
    }
    async getLinuxDiskMetrics() {
        const result = await this.client.executeCommand(`df -h | grep -E '^/dev/' | head -20`);
        const disks = [];
        for (const line of result.stdout.split('\n')) {
            if (line.trim()) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 6) {
                    const total = this.parseSize(parts[1]);
                    const used = this.parseSize(parts[2]);
                    const free = this.parseSize(parts[3]);
                    const percentage = parseFloat(parts[4].replace('%', '')) || 0;
                    disks.push({
                        device: parts[0],
                        total,
                        used,
                        free,
                        percentage,
                        mountPoint: parts[5]
                    });
                }
            }
        }
        return disks;
    }
    parseSize(sizeStr) {
        const match = sizeStr.match(/^([\d.]+)([KMGT]?)$/i);
        if (!match)
            return 0;
        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        switch (unit) {
            case 'K': return value / 1024;
            case 'M': return value / 1024;
            case 'G': return value;
            case 'T': return value * 1024;
            default: return value / (1024 * 1024 * 1024); // Assume bytes
        }
    }
    /**
     * Get network metrics
     */
    async getNetworkMetrics() {
        try {
            if (this.osInfo.type === 'windows') {
                return await this.getWindowsNetworkMetrics();
            }
            else {
                return await this.getLinuxNetworkMetrics();
            }
        }
        catch (error) {
            console.error('Failed to get network metrics:', error);
            return { interfaces: [] };
        }
    }
    async getWindowsNetworkMetrics() {
        const netCommand = `powershell "
      Get-Counter '\\\\Network Interface(*)\\\\Bytes Received/sec', '\\\\Network Interface(*)\\\\Bytes Sent/sec' | 
      ForEach-Object { $_.CounterSamples } | 
      Where-Object { $_.InstanceName -notlike '*Loopback*' -and $_.InstanceName -ne '_Total' } |
      ForEach-Object { Write-Output \"$($_.InstanceName)|$($_.Path)|$($_.CookedValue)\" }
    "`;
        const result = await this.client.executeCommand(netCommand);
        const interfaces = [];
        const interfaceMap = new Map();
        for (const line of result.stdout.split('\n')) {
            if (line.trim() && line.includes('|')) {
                const parts = line.trim().split('|');
                if (parts.length >= 3) {
                    const name = parts[0];
                    const isReceived = parts[1].includes('Bytes Received');
                    const value = parseFloat(parts[2]) || 0;
                    if (!interfaceMap.has(name)) {
                        interfaceMap.set(name, { name, bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0 });
                    }
                    const iface = interfaceMap.get(name);
                    if (isReceived) {
                        iface.bytesIn = value;
                    }
                    else {
                        iface.bytesOut = value;
                    }
                }
            }
        }
        return { interfaces: Array.from(interfaceMap.values()) };
    }
    async getLinuxNetworkMetrics() {
        const result = await this.client.executeCommand(`cat /proc/net/dev | grep -E '^\\s*[^lo]' | head -10`);
        const interfaces = [];
        for (const line of result.stdout.split('\n')) {
            if (line.trim() && line.includes(':')) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 17) {
                    const name = parts[0].replace(':', '');
                    interfaces.push({
                        name,
                        bytesIn: parseInt(parts[1]) || 0,
                        bytesOut: parseInt(parts[9]) || 0,
                        packetsIn: parseInt(parts[2]) || 0,
                        packetsOut: parseInt(parts[10]) || 0
                    });
                }
            }
        }
        return { interfaces };
    }
    /**
     * Get top processes
     */
    async getTopProcesses(limit = 10) {
        try {
            if (this.osInfo.type === 'windows') {
                return await this.getWindowsTopProcesses(limit);
            }
            else {
                return await this.getLinuxTopProcesses(limit);
            }
        }
        catch (error) {
            console.error('Failed to get top processes:', error);
            return [];
        }
    }
    async getWindowsTopProcesses(limit) {
        const processCommand = `powershell "
      Get-Process | Sort-Object CPU -Descending | Select-Object -First ${limit} | ForEach-Object {
        $cpu = if($_.CPU) { [math]::Round($_.CPU, 2) } else { 0 }
        $memory = [math]::Round($_.WorkingSet / 1MB, 2)
        Write-Output \"$($_.Id)|$($_.ProcessName)|$cpu|$memory|$($_.UserName)|Running\"
      }
    "`;
        const result = await this.client.executeCommand(processCommand);
        const processes = [];
        for (const line of result.stdout.split('\n')) {
            if (line.trim() && line.includes('|')) {
                const parts = line.trim().split('|');
                if (parts.length >= 6) {
                    processes.push({
                        pid: parseInt(parts[0]) || 0,
                        name: parts[1] || 'Unknown',
                        cpu: parseFloat(parts[2]) || 0,
                        memory: parseFloat(parts[3]) || 0,
                        user: parts[4] || 'Unknown',
                        status: parts[5] || 'Unknown'
                    });
                }
            }
        }
        return processes;
    }
    async getLinuxTopProcesses(limit) {
        const result = await this.client.executeCommand(`ps aux --sort=-pcpu | head -${limit + 1} | tail -${limit}`);
        const processes = [];
        for (const line of result.stdout.split('\n')) {
            if (line.trim()) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 11) {
                    processes.push({
                        pid: parseInt(parts[1]) || 0,
                        name: parts[10] || 'Unknown',
                        cpu: parseFloat(parts[2]) || 0,
                        memory: parseFloat(parts[3]) || 0,
                        user: parts[0] || 'Unknown',
                        status: parts[7] || 'Unknown'
                    });
                }
            }
        }
        return processes;
    }
    /**
     * Monitor a specific process by PID
     */
    async monitorProcess(pid) {
        try {
            if (this.osInfo.type === 'windows') {
                const command = `powershell "
          $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
          if($p) {
            $cpu = if($p.CPU) { [math]::Round($p.CPU, 2) } else { 0 }
            $memory = [math]::Round($p.WorkingSet / 1MB, 2)
            Write-Output \"$($p.Id)|$($p.ProcessName)|$cpu|$memory|$($p.UserName)|Running|$($p.StartTime)|$($p.Path)\"
          }
        "`;
                const result = await this.client.executeCommand(command);
                if (result.stdout.trim()) {
                    const parts = result.stdout.trim().split('|');
                    if (parts.length >= 6) {
                        return {
                            pid: parseInt(parts[0]) || 0,
                            name: parts[1] || 'Unknown',
                            cpu: parseFloat(parts[2]) || 0,
                            memory: parseFloat(parts[3]) || 0,
                            user: parts[4] || 'Unknown',
                            status: parts[5] || 'Unknown',
                            startTime: parts[6] || undefined,
                            commandLine: parts[7] || undefined
                        };
                    }
                }
            }
            else {
                const command = `ps -p ${pid} -o pid,comm,%cpu,%mem,user,stat,lstart,cmd --no-headers`;
                const result = await this.client.executeCommand(command);
                if (result.stdout.trim()) {
                    const parts = result.stdout.trim().split(/\s+/);
                    if (parts.length >= 8) {
                        return {
                            pid: parseInt(parts[0]) || 0,
                            name: parts[1] || 'Unknown',
                            cpu: parseFloat(parts[2]) || 0,
                            memory: parseFloat(parts[3]) || 0,
                            user: parts[4] || 'Unknown',
                            status: parts[5] || 'Unknown',
                            startTime: parts.slice(6, -1).join(' ') || undefined,
                            commandLine: parts[parts.length - 1] || undefined
                        };
                    }
                }
            }
        }
        catch (error) {
            console.error(`Failed to monitor process ${pid}:`, error);
        }
        return null;
    }
    /**
     * Get system uptime
     */
    async getSystemUptime() {
        try {
            if (this.osInfo.type === 'windows') {
                const command = `powershell "
          $os = Get-WmiObject Win32_OperatingSystem
          $uptime = (Get-Date) - $os.ConvertToDateTime($os.LastBootUpTime)
          Write-Output \"Uptime:$($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m\"
          Write-Output \"BootTime:$($os.ConvertToDateTime($os.LastBootUpTime))\"
        "`;
                const result = await this.client.executeCommand(command);
                const lines = result.stdout.split('\n');
                let uptime = 'Unknown';
                let bootTime = null;
                for (const line of lines) {
                    if (line.startsWith('Uptime:')) {
                        uptime = line.split(':')[1].trim();
                    }
                    else if (line.startsWith('BootTime:')) {
                        const bootTimeStr = line.split(':', 2)[1].trim();
                        bootTime = new Date(bootTimeStr);
                    }
                }
                return { uptime, bootTime };
            }
            else {
                const result = await this.client.executeCommand('uptime -p && uptime -s');
                const lines = result.stdout.trim().split('\n');
                const uptime = lines[0] || 'Unknown';
                const bootTime = lines[1] ? new Date(lines[1]) : null;
                return { uptime, bootTime };
            }
        }
        catch (error) {
            console.error('Failed to get system uptime:', error);
            return { uptime: 'Unknown', bootTime: null };
        }
    }
}
