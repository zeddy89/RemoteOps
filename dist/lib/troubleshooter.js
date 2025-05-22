export class Troubleshooter {
    constructor(client) {
        this.client = client;
    }
    async analyzeDiagnostics(results) {
        const actions = [];
        // Analyze disk space issues
        const diskResult = results.find(r => r.name === 'Disk Space');
        if (diskResult && diskResult.status === 'warning') {
            actions.push({
                name: 'Clean Journal Logs',
                description: 'Remove old journal logs to free up disk space',
                execute: async () => {
                    const { stdout, stderr } = await this.client.executeCommand('sudo journalctl --vacuum-time=7d');
                    return stdout || stderr;
                },
            });
            actions.push({
                name: 'Find Large Files',
                description: 'Find large files that may be consuming disk space',
                execute: async () => {
                    const { stdout, stderr } = await this.client.executeCommand('find /var /tmp -type f -size +100M -exec ls -lh {} \\; 2>/dev/null | sort -k5hr | head -20');
                    return stdout || stderr;
                },
            });
        }
        // Analyze memory issues
        const memoryResult = results.find(r => r.name === 'Memory Usage');
        if (memoryResult) {
            const memoryOutput = memoryResult.output;
            if (memoryOutput.includes('Swap:') && !memoryOutput.includes('Swap: 0')) {
                actions.push({
                    name: 'Memory Consumers',
                    description: 'Find processes consuming the most memory',
                    execute: async () => {
                        const { stdout, stderr } = await this.client.executeCommand('ps aux --sort=-%mem | head -10');
                        return stdout || stderr;
                    },
                });
            }
        }
        // Check for high CPU usage
        const cpuResult = results.find(r => r.name === 'CPU Load');
        if (cpuResult) {
            actions.push({
                name: 'CPU Intensive Processes',
                description: 'Show processes consuming the most CPU',
                execute: async () => {
                    const { stdout, stderr } = await this.client.executeCommand('top -bn2 -d0.5 | grep ^%Cpu | tail -1 && ps aux --sort=-%cpu | head -10');
                    return stdout || stderr;
                },
            });
        }
        // Network troubleshooting
        const networkResult = results.find(r => r.name === 'Network Status');
        if (networkResult) {
            actions.push({
                name: 'Network Connectivity Check',
                description: 'Test basic network connectivity',
                execute: async () => {
                    const { stdout, stderr } = await this.client.executeCommand('ping -c 3 8.8.8.8 && curl -I https://www.google.com');
                    return stdout || stderr;
                },
            });
            actions.push({
                name: 'Active Connections',
                description: 'Show active network connections',
                execute: async () => {
                    const { stdout, stderr } = await this.client.executeCommand('netstat -tunapl | grep ESTABLISHED');
                    return stdout || stderr;
                },
            });
        }
        // Always include some general troubleshooting actions
        actions.push({
            name: 'Recent Errors',
            description: 'Check for recent errors in system logs',
            execute: async () => {
                const { stdout, stderr } = await this.client.executeCommand('journalctl -p err..emerg -n 20 --no-pager');
                return stdout || stderr;
            },
        });
        actions.push({
            name: 'Service Status',
            description: 'Check status of essential services',
            execute: async () => {
                const { stdout, stderr } = await this.client.executeCommand('systemctl list-units --state=failed && systemctl status --no-pager sshd');
                return stdout || stderr;
            },
        });
        return actions;
    }
    async executeAction(action) {
        return action.execute();
    }
    async getCustomActionForIssue(issue) {
        const actions = [];
        // Common user-reported issues and their troubleshooting commands
        const issuePatterns = [
            [
                /slow/i,
                [
                    {
                        name: 'Performance Analysis',
                        description: 'Analyze system performance',
                        execute: async () => {
                            const { stdout, stderr } = await this.client.executeCommand('iostat && vmstat 1 5');
                            return stdout || stderr;
                        },
                    }
                ]
            ],
            [
                /network|connect|internet/i,
                [
                    {
                        name: 'DNS Check',
                        description: 'Check DNS resolution',
                        execute: async () => {
                            const { stdout, stderr } = await this.client.executeCommand('cat /etc/resolv.conf && dig google.com');
                            return stdout || stderr;
                        }
                    },
                    {
                        name: 'Network Routes',
                        description: 'Check network routing table',
                        execute: async () => {
                            const { stdout, stderr } = await this.client.executeCommand('ip route && traceroute -n google.com');
                            return stdout || stderr;
                        }
                    }
                ]
            ],
            [
                /disk|storage|space/i,
                [
                    {
                        name: 'Disk Usage by Directory',
                        description: 'Find directories consuming the most space',
                        execute: async () => {
                            const { stdout, stderr } = await this.client.executeCommand('du -h --max-depth=2 /var /tmp /home | sort -hr | head -20');
                            return stdout || stderr;
                        }
                    }
                ]
            ],
            [
                /crash|segfault/i,
                [
                    {
                        name: 'Crash Logs',
                        description: 'Check for application crash logs',
                        execute: async () => {
                            const { stdout, stderr } = await this.client.executeCommand('dmesg | grep -i segfault && journalctl -p err..emerg --no-pager | tail -30');
                            return stdout || stderr;
                        }
                    }
                ]
            ]
        ];
        for (const [pattern, actionList] of issuePatterns) {
            if (pattern.test(issue)) {
                actions.push(...actionList);
            }
        }
        return actions;
    }
}
