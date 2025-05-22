#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { SSHClient } from './lib/ssh-client.js';
import { DiagnosticRunner } from './lib/diagnostics.js';
import { Troubleshooter } from './lib/troubleshooter.js';
import { Reporter } from './lib/reporter.js';
import { HyperVManager } from './lib/hyperv-manager.js';
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
        const client = new SSHClient(config);
        try {
            await client.connect();
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
            client.disconnect();
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
            client.disconnect();
            throw error;
        }
    }
    async handleSshTroubleshoot(args) {
        const config = this.createSSHConfig(args);
        const client = new SSHClient(config);
        try {
            await client.connect();
            const troubleshooter = new Troubleshooter(client);
            const reporter = new Reporter();
            // Get actions for the specific issue
            const actions = await troubleshooter.getCustomActionForIssue(args.issue);
            if (actions.length === 0) {
                // Run general diagnostics if no specific actions found
                const diagnosticRunner = new DiagnosticRunner(client);
                const diagnosticResults = await diagnosticRunner.runBasicSystemChecks();
                const formattedResults = reporter.formatDiagnosticResults(diagnosticResults);
                client.disconnect();
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
            client.disconnect();
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
            client.disconnect();
            throw error;
        }
    }
    async handleSshCheckUpdates(args) {
        const config = this.createSSHConfig(args);
        const client = new SSHClient(config);
        try {
            await client.connect();
            const diagnosticRunner = new DiagnosticRunner(client);
            const updateResult = await diagnosticRunner.checkPendingUpdates();
            client.disconnect();
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
            client.disconnect();
            throw error;
        }
    }
    async handleSshRunCommand(args) {
        const config = this.createSSHConfig(args);
        const client = new SSHClient(config);
        try {
            await client.connect();
            const { stdout, stderr, code } = await client.executeCommand(args.command);
            client.disconnect();
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
            client.disconnect();
            throw error;
        }
    }
    async handleSshMultiDiagnose(args) {
        const results = [];
        for (const serverConfig of args.servers) {
            try {
                const config = this.createSSHConfig(serverConfig);
                const client = new SSHClient(config);
                await client.connect();
                const diagnosticRunner = new DiagnosticRunner(client);
                const diagnosticResults = await diagnosticRunner.runBasicSystemChecks();
                const reporter = new Reporter();
                const formattedResults = reporter.formatDiagnosticResults(diagnosticResults);
                // Determine overall health status
                const hasErrors = diagnosticResults.some(r => r.status === 'error');
                const hasWarnings = diagnosticResults.some(r => r.status === 'warning');
                const status = hasErrors ? '❌ ERRORS' : hasWarnings ? '⚠️ WARNINGS' : '✅ HEALTHY';
                results.push(`## ${serverConfig.host} - ${status}\n\n${formattedResults}`);
                client.disconnect();
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
        const client = new SSHClient(config);
        try {
            await client.connect();
            const hyperv = new HyperVManager(client);
            const vmInfo = await hyperv.getVMDetails(args.vmName);
            client.disconnect();
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
            client.disconnect();
            throw error;
        }
    }
    async handleHypervControlVM(args) {
        const config = this.createSSHConfig(args);
        const client = new SSHClient(config);
        try {
            await client.connect();
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
            client.disconnect();
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
            client.disconnect();
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
