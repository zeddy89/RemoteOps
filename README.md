# RemoteOps

A powerful SSH client for server diagnostics, troubleshooting, and infrastructure management. RemoteOps now supports both traditional CLI usage and AI integration through the Model Context Protocol (MCP), allowing AI models like Claude to manage your infrastructure through natural language.

> **🚀 New**: Now available as an MCP server for AI-powered infrastructure management!

## Features

### 🤖 **AI Integration (MCP Server)**
- **Natural Language Interface**: "Check disk space on my production server"
- **Intelligent Workflows**: AI can chain operations and analyze results
- **14 Powerful Tools** available to AI models:
  - System diagnostics and troubleshooting
  - Multi-server command execution (parallel/sequential)
  - Real-time system monitoring
  - Process management and monitoring
  - Custom command execution
  - Update checking
  - Hyper-V VM management
  - Connection pooling with health checks

### 🛠️ **Traditional CLI Features**
- **SSH Connection Management**: Secure connections with key-based or password authentication
- **Comprehensive Diagnostics**: Automated system health, disk space, memory, CPU checks
- **Intelligent Troubleshooting**: Suggests and executes appropriate actions
- **Issue-Specific Tools**: Target problems like disk space, network issues, etc.
- **Interactive Shell**: Open shell sessions when needed
- **Detailed Reporting**: Generate HTML or JSON reports
- **Windows Hyper-V Management**: Create and manage VMs from any platform
- **Multi-Server Operations**: Execute commands on multiple servers simultaneously
- **Connection Resilience**: Automatic reconnection after server reboots or network issues
- **Persistent Connection Pooling**: Reuse SSH connections for better performance
- **Non-Interactive Mode**: Perfect for automation and scripts

## Installation

```bash
# Clone the repository
git clone https://github.com/zeddy89/RemoteOps.git
cd RemoteOps

# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Link the package globally (optional)
npm link
```

## Usage Modes

### 🤖 MCP Server Mode (AI Integration)

Run as an MCP server for AI model integration:

```bash
npm start
# or
node dist/mcp-server.js
```

#### Configure with Claude Code

Create or update `.claude.json` in your project directory:

```json
{
  "mcpServers": {
    "remoteops": {
      "command": "node",
      "args": ["dist/mcp-server.js"],
      "cwd": "/path/to/RemoteOps",
      "env": {},
      "alwaysAllow": []
    }
  }
}
```

#### Available MCP Tools

1. **ssh_connect_diagnose** - Full system diagnostics
2. **ssh_troubleshoot** - Issue-specific troubleshooting  
3. **ssh_check_updates** - Check for system updates
4. **ssh_run_command** - Execute custom commands
5. **ssh_smart_command** - OS-aware command execution (PowerShell/bash)
6. **ssh_multi_diagnose** - Multi-server diagnostics
7. **ssh_multi_command** - Execute commands on multiple servers simultaneously (parallel/sequential)
8. **system_metrics** - Real-time CPU, memory, disk, network monitoring
9. **process_monitor** - Monitor processes by PID or get top processes
10. **system_uptime** - System availability and boot time information
11. **hyperv_list_vms** - List Hyper-V VMs
12. **hyperv_vm_info** - Get VM details
13. **hyperv_control_vm** - Start/stop VMs
14. **connection_pool_status** - View SSH connection pool status

#### Example AI Interactions

Once configured, you can interact naturally:

- *"Run diagnostics on my production server at 192.168.1.214 using root/password"*
- *"Get real-time system metrics for my Linux server - CPU, memory, disk, and network"*
- *"Check what's causing high CPU usage on server X"* 
- *"Monitor process PID 1234 on my Windows server"*
- *"Show me the top 10 processes consuming the most resources"*
- *"List all my Hyper-V virtual machines on my Windows host"*
- *"Start the VM named 'development-server'"*
- *"Check disk space on all my servers"*
- *"Execute 'uptime' on multiple servers simultaneously"*
- *"Run system updates on my development environment servers in parallel"*
- *"Show me the connection pool status and which servers are connected"*

#### Multi-Server Operations

The `ssh_multi_command` tool enables powerful multi-server management:

**Key Features:**
- **Parallel Execution**: Run commands on multiple servers simultaneously for speed
- **Sequential Execution**: Run commands one server at a time for controlled operations
- **Connection Health Checks**: Pre-verify connectivity before executing commands
- **Detailed Results**: Comprehensive success/failure reporting with execution times
- **Custom Labels**: Assign friendly names to servers for better organization
- **Timeout Control**: Set custom timeouts per command execution
- **Error Categorization**: Friendly error messages for common connection issues

**Example Usage:**

```json
{
  "command": "df -h",
  "servers": [
    {
      "host": "192.168.1.100",
      "username": "admin",
      "label": "Web Server"
    },
    {
      "host": "192.168.1.101", 
      "username": "admin",
      "label": "Database Server"
    },
    {
      "host": "192.168.1.102",
      "username": "root",
      "label": "Load Balancer"
    }
  ],
  "parallel": true,
  "timeout": 30,
  "precheck": true
}
```

**Common Use Cases:**
- **System Updates**: `apt update && apt upgrade` across multiple servers
- **Health Checks**: `uptime && free -h && df -h` for quick system overview
- **Configuration Deployment**: Deploy configuration files or restart services
- **Log Collection**: Gather logs from multiple servers for analysis
- **Security Patching**: Apply security updates across infrastructure
- **Monitoring**: Check service status across server fleet

### 🖥️ Traditional CLI Mode

Run traditional CLI commands:

```bash
npm run start:cli
# or
node dist/index.js
```

#### Connect and Diagnose

```bash
remoteops connect --host example.com --username myuser
```

Options:
- `-h, --host <host>`: Server hostname or IP address
- `-p, --port <port>`: SSH port (default: 22)
- `-u, --username <username>`: SSH username
- `-k, --key <key_path>`: Path to private key file
- `-P, --password`: Use password authentication
- `-r, --report <format>`: Generate report (json, html)

#### Troubleshoot Specific Issues

```bash
remoteops troubleshoot --host example.com --issue "disk space"
```

#### Run Custom Commands

```bash
remoteops run --host example.com --command "ps aux | grep nginx"
```

#### Check for System Updates

```bash
remoteops updates --host example.com --username myuser
```

#### Multiple Server Operations

Run command on multiple servers:
```bash
remoteops multi --hosts "server1.com,server2.com,192.168.1.10" --username admin --command "uptime"
```

Run diagnostics on multiple servers:
```bash
remoteops multi-diag --hosts "server1.com,server2.com" --username admin --report html
```

#### Hyper-V Management

List and manage VMs:
```bash
remoteops hyperv --host windows-server.com --username admin --list
```

Create a new VM:
```bash
remoteops hyperv-create --host windows-server.com --username admin --name "UbuntuVM" --memory 4 --cpu 2 --disk 60 --iso "C:\path\to\ubuntu.iso"
```

VM Management Options:
- `-l, --list`: List all VMs
- `-i, --info <name>`: Get VM details
- `-s, --start <name>`: Start a VM
- `-S, --stop <name>`: Stop a VM
- `-f, --force`: Force stop (use with --stop)
- `--delete <name>`: Delete a VM
- `--host-info`: Get host information
- `--switches`: List virtual switches
- `--attach-iso <name>`: Attach ISO to VM

## Authentication Methods

### SSH Key Authentication (Recommended)

```bash
remoteops connect --host example.com --key ~/.ssh/id_rsa
```

With passphrase:
```bash
remoteops connect --host example.com --key ~/.ssh/id_rsa --passphrase "your-passphrase"
```

### SSH Config File

```bash
remoteops connect --host example.com --config ~/.ssh/config
```

### SSH Agent

```bash
ssh-add ~/.ssh/id_rsa  # Add key to agent first
remoteops connect --host example.com
```

### Password Authentication

```bash
remoteops connect --host example.com -P  # Will prompt for password
```

Or non-interactively:
```bash
remoteops connect --host example.com --pwd "your-password"
```

## Interactive Mode

Run commands without options for guided setup:

```bash
remoteops connect
```

This prompts for:
- Server hostname
- SSH port (defaults to 22)
- Username
- Authentication method
- Key selection (if using keys)
- Passphrase/password (if required)

## Diagnostic Capabilities

The system checks and reports on:

- System information and uptime
- Disk space usage and available storage
- Memory utilization and swap usage
- CPU load and running processes
- Network status and connectivity
- System logs and recent errors
- Service status and health
- Pending system updates

## Troubleshooting Features

AI-powered and rule-based suggestions for:

- Cleaning up disk space
- Finding large files and directories
- Identifying memory-intensive processes
- Checking network connectivity issues
- Analyzing recent error logs
- Verifying critical service status
- Performance optimization recommendations

## Development

### Project Structure

- `src/mcp-server.ts`: MCP server for AI integration
- `src/index.ts`: Traditional CLI application
- `src/lib/ssh-client.ts`: SSH connection management
- `src/lib/diagnostics.ts`: System diagnostic tools
- `src/lib/troubleshooter.ts`: Troubleshooting logic
- `src/lib/reporter.ts`: Report generation
- `src/lib/hyperv-manager.ts`: Hyper-V VM management

### Build and Development

```bash
# Build TypeScript
npm run build

# Run MCP server in development
npm run dev

# Run CLI in development  
npm run dev:cli

# Run tests
npm test
```

### Package.json Scripts

- `npm start`: Run MCP server
- `npm run start:cli`: Run traditional CLI
- `npm run dev`: Development MCP server
- `npm run dev:cli`: Development CLI
- `npm run build`: Build TypeScript

## MCP vs CLI Comparison

| Feature | MCP Server | CLI |
|---------|------------|-----|
| **Interface** | Natural language via AI | Command-line flags |
| **Integration** | AI models (Claude, etc.) | Terminal/scripts |
| **Workflow** | AI can chain operations | Manual command execution |
| **Learning Curve** | Conversational | Requires memorizing commands |
| **Automation** | AI-driven intelligence | Script-based |
| **Use Cases** | Interactive exploration, complex workflows | Scripting, automation |

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## AI-Powered Infrastructure Management

RemoteOps transforms traditional server management by enabling AI models to:

1. **Understand Context**: AI interprets your infrastructure needs
2. **Execute Intelligently**: Chains appropriate diagnostic and management commands
3. **Provide Insights**: Analyzes results and suggests optimizations
4. **Learn Patterns**: Adapts to your infrastructure and preferences

### Example AI Workflows

**Comprehensive Health Check:**
> "Check the health of my production environment - servers 192.168.1.10, 192.168.1.11, and 192.168.1.12"

**Intelligent Troubleshooting:**
> "My application is running slow. Can you check server performance and suggest fixes?"

**VM Management:**
> "Create a new Ubuntu VM on my Windows host with 8GB RAM and 100GB disk, then install Ubuntu Server"

**Multi-Server Operations:**
> "Update all my servers and restart any services that need it"

This represents the future of infrastructure management - where natural language meets powerful automation! 🚀