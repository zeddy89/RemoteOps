#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { SSHClient } from './lib/ssh-client.js';
import { DiagnosticRunner } from './lib/diagnostics.js';
import { Troubleshooter } from './lib/troubleshooter.js';
import { Reporter } from './lib/reporter.js';
import { HyperVManager } from './lib/hyperv-manager.js';
import { connectionPool } from './lib/connection-pool.js';
import { OSDetector } from './lib/os-detector.js';
import { SystemMonitor } from './lib/system-monitor.js';
// MCP Server for RemoteOps SSH diagnostics and troubleshooting
class RemoteOpsServer {
    constructor() {
        this.server = new Server({
            name: 'remoteops',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupHandlers();
    }
    setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'ssh_connect_diagnose',
                        description: 'Connect to a server via SSH and run comprehensive system diagnostics',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Server hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'SSH username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                            },
                            required: ['host', 'username'],
                        },
                    },
                    {
                        name: 'ssh_troubleshoot',
                        description: 'Connect to a server and troubleshoot a specific issue',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Server hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'SSH username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                                issue: {
                                    type: 'string',
                                    description: 'Description of the issue to troubleshoot (e.g., "slow performance", "disk space", "high CPU")',
                                },
                            },
                            required: ['host', 'username', 'issue'],
                        },
                    },
                    {
                        name: 'ssh_check_updates',
                        description: 'Check for pending system updates on a server',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Server hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'SSH username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                            },
                            required: ['host', 'username'],
                        },
                    },
                    {
                        name: 'ssh_run_command',
                        description: 'Execute a custom command on a remote server',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Server hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'SSH username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                                command: {
                                    type: 'string',
                                    description: 'Command to execute on the remote server',
                                },
                            },
                            required: ['host', 'username', 'command'],
                        },
                    },
                    {
                        name: 'ssh_multi_diagnose',
                        description: 'Run diagnostics on multiple servers simultaneously',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                servers: {
                                    type: 'array',
                                    description: 'List of servers to diagnose',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            host: {
                                                type: 'string',
                                                description: 'Server hostname or IP address',
                                            },
                                            port: {
                                                type: 'number',
                                                description: 'SSH port (default: 22)',
                                                default: 22,
                                            },
                                            username: {
                                                type: 'string',
                                                description: 'SSH username',
                                            },
                                            password: {
                                                type: 'string',
                                                description: 'SSH password (optional if using key)',
                                            },
                                            privateKey: {
                                                type: 'string',
                                                description: 'Path to private key file (optional if using password)',
                                            },
                                            passphrase: {
                                                type: 'string',
                                                description: 'Passphrase for encrypted private key (optional)',
                                            },
                                        },
                                        required: ['host', 'username'],
                                    },
                                },
                            },
                            required: ['servers'],
                        },
                    },
                    {
                        name: 'hyperv_list_vms',
                        description: 'List all Hyper-V virtual machines on a Windows host',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Windows Hyper-V host hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'Windows username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                            },
                            required: ['host', 'username'],
                        },
                    },
                    {
                        name: 'hyperv_vm_info',
                        description: 'Get detailed information about a specific Hyper-V virtual machine',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Windows Hyper-V host hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'Windows username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                                vmName: {
                                    type: 'string',
                                    description: 'Name of the virtual machine',
                                },
                            },
                            required: ['host', 'username', 'vmName'],
                        },
                    },
                    {
                        name: 'hyperv_control_vm',
                        description: 'Start, stop, or manage a Hyper-V virtual machine',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Windows Hyper-V host hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'Windows username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                                vmName: {
                                    type: 'string',
                                    description: 'Name of the virtual machine',
                                },
                                action: {
                                    type: 'string',
                                    description: 'Action to perform on the VM',
                                    enum: ['start', 'stop', 'force-stop'],
                                },
                            },
                            required: ['host', 'username', 'vmName', 'action'],
                        },
                    },
                    {
                        name: 'connection_pool_status',
                        description: 'Get the status of SSH connection pool',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'connection_pool_disconnect',
                        description: 'Disconnect and remove a specific connection from the pool',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Server hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'SSH username',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional)',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional)',
                                },
                            },
                            required: ['host', 'username'],
                        },
                    },
                    {
                        name: 'ssh_smart_command',
                        description: 'Execute a command using OS-appropriate syntax (PowerShell for Windows, bash for Linux)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Server hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'SSH username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                                command: {
                                    type: 'string',
                                    description: 'Command to execute (will be adapted for the detected OS)',
                                },
                            },
                            required: ['host', 'username', 'command'],
                        },
                    },
                    {
                        name: 'system_metrics',
                        description: 'Get comprehensive real-time system metrics (CPU, memory, disk, network, processes)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Server hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'SSH username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                            },
                            required: ['host', 'username'],
                        },
                    },
                    {
                        name: 'process_monitor',
                        description: 'Monitor a specific process by PID or get top processes',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Server hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'SSH username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                                pid: {
                                    type: 'number',
                                    description: 'Process ID to monitor (optional - if not provided, returns top processes)',
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Number of top processes to return (default: 10)',
                                    default: 10,
                                },
                            },
                            required: ['host', 'username'],
                        },
                    },
                    {
                        name: 'system_uptime',
                        description: 'Get system uptime and boot time information',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Server hostname or IP address',
                                },
                                port: {
                                    type: 'number',
                                    description: 'SSH port (default: 22)',
                                    default: 22,
                                },
                                username: {
                                    type: 'string',
                                    description: 'SSH username',
                                },
                                password: {
                                    type: 'string',
                                    description: 'SSH password (optional if using key)',
                                },
                                privateKey: {
                                    type: 'string',
                                    description: 'Path to private key file (optional if using password)',
                                },
                                passphrase: {
                                    type: 'string',
                                    description: 'Passphrase for encrypted private key (optional)',
                                },
                            },
                            required: ['host', 'username'],
                        },
                    },
                ],
            };
        });
        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case 'ssh_connect_diagnose':
                        return await this.handleSshConnectDiagnose(args);
                    case 'ssh_troubleshoot':
                        return await this.handleSshTroubleshoot(args);
                    case 'ssh_check_updates':
                        return await this.handleSshCheckUpdates(args);
                    case 'ssh_run_command':
                        return await this.handleSshRunCommand(args);
                    case 'ssh_multi_diagnose':
                        return await this.handleSshMultiDiagnose(args);
                    case 'hyperv_list_vms':
                        return await this.handleHypervListVMs(args);
                    case 'hyperv_vm_info':
                        return await this.handleHypervVMInfo(args);
                    case 'hyperv_control_vm':
                        return await this.handleHypervControlVM(args);
                    case 'connection_pool_status':
                        return await this.handleConnectionPoolStatus(args);
                    case 'connection_pool_disconnect':
                        return await this.handleConnectionPoolDisconnect(args);
                    case 'ssh_smart_command':
                        return await this.handleSshSmartCommand(args);
                    case 'system_metrics':
                        return await this.handleSystemMetrics(args);
                    case 'process_monitor':
                        return await this.handleProcessMonitor(args);
                    case 'system_uptime':
                        return await this.handleSystemUptime(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    isError: true,
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${errorMessage}`,
                        },
                    ],
                };
            }
        });
    }
    createSSHConfig(args) {
        return {
            host: args.host,
            port: args.port || 22,
            username: args.username,
            password: args.password,
            privateKey: args.privateKey,
            passphrase: args.passphrase,
            useAgent: !args.password && !args.privateKey, // Use agent if no password or key provided
        };
    }
    async handleSshConnectDiagnose(args) {
        const config = this.createSSHConfig(args);
        const client = await connectionPool.getConnection(args.host, config);
        try {
            const diagnosticRunner = new DiagnosticRunner(client);
            const troubleshooter = new Troubleshooter(client);
            const reporter = new Reporter();
            // Run basic diagnostics
            const diagnosticResults = await diagnosticRunner.runBasicSystemChecks();
            // Analyze and get suggested actions
            const actions = await troubleshooter.analyzeDiagnostics(diagnosticResults);
            // Format results
            const formattedResults = reporter.formatDiagnosticResults(diagnosticResults);
            // Get system info for context
            const systemInfo = (await client.executeCommand('uname -a && hostname && uptime')).stdout;
            return {
                content: [
                    {
                        type: 'text',
                        text: `# System Diagnostics for ${args.host}\n\n## System Information\n${systemInfo}\n\n## Diagnostic Results\n${formattedResults}\n\n## Suggested Actions\n${actions.map(action => `- **${action.name}**: ${action.description}`).join('\n')}`,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async handleSshTroubleshoot(args) {
        const config = this.createSSHConfig(args);
        const client = await connectionPool.getConnection(args.host, config);
        try {
            const troubleshooter = new Troubleshooter(client);
            const reporter = new Reporter();
            // Get actions for the specific issue
            const actions = await troubleshooter.getCustomActionForIssue(args.issue);
            if (actions.length === 0) {
                // Run general diagnostics if no specific actions found
                const diagnosticRunner = new DiagnosticRunner(client);
                const diagnosticResults = await diagnosticRunner.runBasicSystemChecks();
                const formattedResults = reporter.formatDiagnosticResults(diagnosticResults);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `# Troubleshooting "${args.issue}" on ${args.host}\n\nNo specific troubleshooting actions found for the described issue. Running general diagnostics instead:\n\n${formattedResults}`,
                        },
                    ],
                };
            }
            // Execute all actions for this issue
            const results = [];
            for (const action of actions) {
                const output = await troubleshooter.executeAction(action);
                results.push(reporter.formatActionResult(action.name, output));
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `# Troubleshooting "${args.issue}" on ${args.host}\n\n${results.join('\n\n')}`,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async handleSshCheckUpdates(args) {
        const config = this.createSSHConfig(args);
        const client = await connectionPool.getConnection(args.host, config);
        try {
            const diagnosticRunner = new DiagnosticRunner(client);
            const updateResult = await diagnosticRunner.checkPendingUpdates();
            return {
                content: [
                    {
                        type: 'text',
                        text: `# Pending Updates on ${args.host}\n\n**Status**: ${updateResult.status.toUpperCase()}\n\n**Details**:\n${updateResult.output}\n\n${updateResult.details ? `**Summary**: ${updateResult.details}` : ''}`,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async handleSshRunCommand(args) {
        const config = this.createSSHConfig(args);
        const client = await connectionPool.getConnection(args.host, config);
        try {
            const { stdout, stderr, code } = await client.executeCommand(args.command);
            return {
                content: [
                    {
                        type: 'text',
                        text: `# Command Execution on ${args.host}\n\n**Command**: \`${args.command}\`\n**Exit Code**: ${code}\n\n**Output**:\n\`\`\`\n${stdout || stderr}\n\`\`\``,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async handleSshMultiDiagnose(args) {
        const results = [];
        for (const serverConfig of args.servers) {
            try {
                const config = this.createSSHConfig(serverConfig);
                const client = await connectionPool.getConnection(serverConfig.host, config);
                const diagnosticRunner = new DiagnosticRunner(client);
                const diagnosticResults = await diagnosticRunner.runBasicSystemChecks();
                const reporter = new Reporter();
                const formattedResults = reporter.formatDiagnosticResults(diagnosticResults);
                // Determine overall health status
                const hasErrors = diagnosticResults.some(r => r.status === 'error');
                const hasWarnings = diagnosticResults.some(r => r.status === 'warning');
                const status = hasErrors ? '❌ ERRORS' : hasWarnings ? '⚠️ WARNINGS' : '✅ HEALTHY';
                results.push(`## ${serverConfig.host} - ${status}\n\n${formattedResults}`);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                results.push(`## ${serverConfig.host} - ❌ CONNECTION FAILED\n\nError: ${errorMessage}`);
            }
        }
        return {
            content: [
                {
                    type: 'text',
                    text: `# Multi-Server Diagnostics\n\n${results.join('\n\n---\n\n')}`,
                },
            ],
        };
    }
    async handleHypervListVMs(args) {
        const config = this.createSSHConfig(args);
        const client = new SSHClient(config);
        try {
            await client.connect();
            const hyperv = new HyperVManager(client);
            const vms = await hyperv.listVMs();
            client.disconnect();
            if (vms.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `# Hyper-V Virtual Machines on ${args.host}\n\nNo virtual machines found.`,
                        },
                    ],
                };
            }
            const vmList = vms.map(vm => {
                const stateIcon = vm.state === 'Running' ? '🟢' : (vm.state === 'Off' ? '🔴' : '🟡');
                return `${stateIcon} **${vm.name}** - ${vm.state}${vm.memoryAssigned ? ` (${vm.memoryAssigned})` : ''}${vm.cpuUsage ? ` - CPU: ${vm.cpuUsage}%` : ''}`;
            }).join('\n');
            return {
                content: [
                    {
                        type: 'text',
                        text: `# Hyper-V Virtual Machines on ${args.host}\n\n${vmList}`,
                    },
                ],
            };
        }
        catch (error) {
            client.disconnect();
            throw error;
        }
    }
    async handleHypervVMInfo(args) {
        const config = this.createSSHConfig(args);
        const client = await connectionPool.getConnection(args.host, config);
        try {
            const hyperv = new HyperVManager(client);
            const vmInfo = await hyperv.getVMDetails(args.vmName);
            const stateIcon = vmInfo.state === 'Running' ? '🟢' : (vmInfo.state === 'Off' ? '🔴' : '🟡');
            return {
                content: [
                    {
                        type: 'text',
                        text: `# VM Information: ${vmInfo.name}\n\n${stateIcon} **State**: ${vmInfo.state}\n**Generation**: ${vmInfo.generation}\n**Memory**: ${vmInfo.memoryAssigned}\n**Dynamic Memory**: ${vmInfo.dynamicMemoryEnabled ? 'Enabled' : 'Disabled'}\n${vmInfo.cpuUsage ? `**CPU Usage**: ${vmInfo.cpuUsage}%\n` : ''}${vmInfo.uptime ? `**Uptime**: ${vmInfo.uptime}\n` : ''}\n${vmInfo.networkAdapters && vmInfo.networkAdapters.length > 0 ? `\n**Network Adapters**:\n${vmInfo.networkAdapters.map((adapter, i) => `${i + 1}. ${adapter}`).join('\n')}\n` : ''}${vmInfo.hardDrives && vmInfo.hardDrives.length > 0 ? `\n**Hard Drives**:\n${vmInfo.hardDrives.map((drive, i) => `${i + 1}. ${drive}`).join('\n')}` : ''}`,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async handleHypervControlVM(args) {
        const config = this.createSSHConfig(args);
        const client = await connectionPool.getConnection(args.host, config);
        try {
            const hyperv = new HyperVManager(client);
            switch (args.action) {
                case 'start':
                    await hyperv.startVM(args.vmName);
                    break;
                case 'stop':
                    await hyperv.stopVM(args.vmName, false);
                    break;
                case 'force-stop':
                    await hyperv.stopVM(args.vmName, true);
                    break;
                default:
                    throw new Error(`Unknown action: ${args.action}`);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `# VM Control Action Completed\n\n✅ Successfully executed **${args.action}** on VM **${args.vmName}** on host ${args.host}`,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async handleConnectionPoolStatus(args) {
        try {
            const status = connectionPool.getPoolStatus();
            const connectionList = status.connections.map(conn => {
                const statusIcon = conn.isConnected ? '🟢' : '🔴';
                const osIcon = conn.osType === 'windows' ? '🪟' : conn.osType === 'linux' ? '🐧' : '🖥️';
                const lastUsedAgo = Math.round((Date.now() - conn.lastUsed.getTime()) / 1000);
                const osInfo = conn.osType ? ` ${osIcon} ${conn.osType} (${conn.shell})` : '';
                return `${statusIcon} **${conn.host}** (${conn.username})${osInfo} - Last used: ${lastUsedAgo}s ago`;
            }).join('\n');
            return {
                content: [
                    {
                        type: 'text',
                        text: `# SSH Connection Pool Status\n\n**Total Connections**: ${status.totalConnections}\n**Active Connections**: ${status.activeConnections}\n\n## Connections:\n${connectionList || 'No connections in pool'}`,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async handleConnectionPoolDisconnect(args) {
        try {
            const config = this.createSSHConfig(args);
            await connectionPool.removeConnection(args.host, config);
            return {
                content: [
                    {
                        type: 'text',
                        text: `# Connection Removed\n\n✅ Successfully disconnected and removed connection to **${args.host}** from the pool.`,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async handleSshSmartCommand(args) {
        const config = this.createSSHConfig(args);
        const client = await connectionPool.getConnection(args.host, config);
        try {
            // Get OS info from connection pool
            const osInfo = connectionPool.getOSInfo(args.host, config);
            if (!osInfo) {
                // Fallback: detect OS if not available
                const detectedOS = await OSDetector.detectOS(client, args.host);
                var formattedCommand = OSDetector.formatCommand(detectedOS, args.command);
                var osDisplay = `${detectedOS.type} (${detectedOS.shell})`;
            }
            else {
                var formattedCommand = OSDetector.formatCommand(osInfo, args.command);
                var osDisplay = `${osInfo.type} (${osInfo.shell})`;
            }
            const { stdout, stderr, code } = await client.executeCommand(formattedCommand);
            return {
                content: [
                    {
                        type: 'text',
                        text: `# Smart Command Execution on ${args.host}\n\n**Detected OS**: ${osDisplay}\n**Original Command**: \`${args.command}\`\n**Executed Command**: \`${formattedCommand}\`\n**Exit Code**: ${code}\n\n**Output**:\n\`\`\`\n${stdout || stderr}\n\`\`\``,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async handleSystemMetrics(args) {
        const config = this.createSSHConfig(args);
        const client = await connectionPool.getConnection(args.host, config);
        try {
            // Get OS info from connection pool
            const osInfo = connectionPool.getOSInfo(args.host, config);
            if (!osInfo) {
                throw new Error('OS detection required for system metrics');
            }
            const monitor = new SystemMonitor(client, osInfo);
            const metrics = await monitor.getSystemMetrics(args.host);
            // Format metrics for display
            const cpuInfo = `**CPU Usage**: ${metrics.cpu.usage}% (${metrics.cpu.cores} cores)${metrics.cpu.loadAverage ? ` | **Load**: ${metrics.cpu.loadAverage.join(', ')}` : ''}`;
            const memoryInfo = `**Memory**: ${metrics.memory.used}MB / ${metrics.memory.total}MB (${metrics.memory.percentage}% used) | **Available**: ${metrics.memory.available}MB`;
            const diskInfo = metrics.disk.map(disk => `**${disk.device}** (${disk.mountPoint}): ${disk.used}GB / ${disk.total}GB (${disk.percentage}% used)`).join('\n');
            const processInfo = metrics.processes.slice(0, 5).map(proc => `**${proc.name}** (PID: ${proc.pid}) - CPU: ${proc.cpu}%, Memory: ${proc.memory}MB, User: ${proc.user}`).join('\n');
            const networkInfo = metrics.network.interfaces.slice(0, 3).map(iface => `**${iface.name}**: ↓${Math.round(iface.bytesIn / 1024)}KB ↑${Math.round(iface.bytesOut / 1024)}KB`).join('\n');
            return {
                content: [
                    {
                        type: 'text',
                        text: `# System Metrics for ${args.host}\n\n🕐 **Collected**: ${metrics.timestamp.toLocaleString()}\n\n## 🖥️ CPU\n${cpuInfo}\n\n## 💾 Memory\n${memoryInfo}\n\n## 💽 Disk Usage\n${diskInfo}\n\n## 🌐 Network Interfaces\n${networkInfo || 'No network data available'}\n\n## 🔝 Top Processes\n${processInfo}`,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async handleProcessMonitor(args) {
        const config = this.createSSHConfig(args);
        const client = await connectionPool.getConnection(args.host, config);
        try {
            // Get OS info from connection pool
            const osInfo = connectionPool.getOSInfo(args.host, config);
            if (!osInfo) {
                throw new Error('OS detection required for process monitoring');
            }
            const monitor = new SystemMonitor(client, osInfo);
            if (args.pid) {
                // Monitor specific process
                const process = await monitor.monitorProcess(args.pid);
                if (process) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `# Process Monitor: ${process.name} (PID: ${process.pid})\n\n**Name**: ${process.name}\n**PID**: ${process.pid}\n**CPU Usage**: ${process.cpu}%\n**Memory Usage**: ${process.memory}MB\n**User**: ${process.user}\n**Status**: ${process.status}${process.startTime ? `\n**Start Time**: ${process.startTime}` : ''}${process.commandLine ? `\n**Command**: ${process.commandLine}` : ''}`,
                            },
                        ],
                    };
                }
                else {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `# Process Monitor\n\n❌ Process with PID ${args.pid} not found on ${args.host}`,
                            },
                        ],
                    };
                }
            }
            else {
                // Get top processes
                const processes = await monitor.getTopProcesses(args.limit || 10);
                const processInfo = processes.map((proc, index) => `${index + 1}. **${proc.name}** (PID: ${proc.pid}) - CPU: ${proc.cpu}%, Memory: ${proc.memory}MB, User: ${proc.user}`).join('\n');
                return {
                    content: [
                        {
                            type: 'text',
                            text: `# Top Processes on ${args.host}\n\n🔝 **Showing top ${processes.length} processes by CPU usage:**\n\n${processInfo}`,
                        },
                    ],
                };
            }
        }
        catch (error) {
            throw error;
        }
    }
    async handleSystemUptime(args) {
        const config = this.createSSHConfig(args);
        const client = await connectionPool.getConnection(args.host, config);
        try {
            // Get OS info from connection pool
            const osInfo = connectionPool.getOSInfo(args.host, config);
            if (!osInfo) {
                throw new Error('OS detection required for uptime monitoring');
            }
            const monitor = new SystemMonitor(client, osInfo);
            const uptime = await monitor.getSystemUptime();
            return {
                content: [
                    {
                        type: 'text',
                        text: `# System Uptime for ${args.host}\n\n⏰ **Uptime**: ${uptime.uptime}\n${uptime.bootTime ? `🚀 **Boot Time**: ${uptime.bootTime.toLocaleString()}` : ''}`,
                    },
                ],
            };
        }
        catch (error) {
            throw error;
        }
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}
// Start the server
const server = new RemoteOpsServer();
server.run().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
