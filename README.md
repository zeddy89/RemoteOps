# MCP SSH Client

A powerful SSH client for server diagnostics, troubleshooting, and infrastructure management. This tool helps you connect to remote servers, run diagnostics, troubleshoot issues, execute commands, and manage Hyper-V virtual machines - all from a simple interactive interface.

> **Note:** This tool is specifically designed to work with the Anthropic Claude Code environment, providing an easy way to troubleshoot and diagnose issues on remote servers.

## Features

- **SSH Connection Management**: Secure connections to remote servers with key-based or password authentication
- **Comprehensive Diagnostics**: Automated checks for system health, disk space, memory usage, CPU load, and more
- **Intelligent Troubleshooting**: Suggests and executes appropriate actions based on diagnostic results
- **Issue-Specific Tools**: Target specific problems like disk space issues, network problems, etc.
- **Interactive Shell**: Open an interactive shell session when needed
- **Detailed Reporting**: Generate HTML or JSON reports of findings
- **User-Friendly Interface**: Interactive prompts guide you through the process
- **Windows Hyper-V Management**: Create and manage virtual machines on Windows hosts from any platform
- **ISO Management**: Attach and detach ISO files to VMs for OS installation
- **Updates Management**: Check for and install system updates on remote servers
- **Multi-Server Operations**: Execute commands or run diagnostics on multiple servers simultaneously
- **Non-Interactive Mode**: Run commands in automated scripts without user prompts

## Installation

```bash
# Clone the repository
git clone https://github.com/slewis/mcp-ssh-client.git
cd mcp-ssh-client

# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Link the package globally (optional)
npm link
```

## Usage

### Connect and Diagnose

Connect to a server and run basic diagnostics:

```bash
mcp-ssh-client connect --host example.com --username myuser
```

Options:
- `-h, --host <host>`: Server hostname or IP address
- `-p, --port <port>`: SSH port (default: 22)
- `-u, --username <username>`: SSH username
- `-k, --key <key_path>`: Path to private key file
- `-P, --password`: Use password authentication
- `-r, --report <format>`: Generate report in a specific format (json, html)

### Troubleshoot Specific Issues

Directly troubleshoot a specific issue:

```bash
mcp-ssh-client troubleshoot --host example.com --issue "disk space"
```

Options:
- Same connection options as the `connect` command
- `-i, --issue <issue>`: Description of the issue (e.g., "slow performance", "disk space")

### Run Custom Commands

Execute a custom command on the server:

```bash
mcp-ssh-client run --host example.com --command "ps aux | grep nginx"
```

Options:
- Same connection options as the `connect` command
- `-c, --command <command>`: Command to execute

### Check for System Updates

Check for pending system updates on a server:

```bash
mcp-ssh-client updates --host example.com --username myuser
```

Options:
- Same connection options as the `connect` command

### Multiple Server Operations

#### Run Command on Multiple Servers

Execute the same command on multiple servers simultaneously:

```bash
mcp-ssh-client multi --hosts "server1.com,server2.com,192.168.1.10" --username admin --command "uptime"
```

Options:
- `-h, --hosts <hosts>`: Comma-separated list of hostnames or IP addresses
- Same connection options as other commands
- `-c, --command <command>`: Command to execute on all servers

#### Run Diagnostics on Multiple Servers

Run system diagnostics on multiple servers simultaneously:

```bash
mcp-ssh-client multi-diag --hosts "server1.com,server2.com" --username admin --report html
```

Options:
- `-h, --hosts <hosts>`: Comma-separated list of hostnames or IP addresses
- Same connection options as other commands
- `-r, --report <format>`: Generate reports for each server (json, html)

### Hyper-V Management

#### List and Manage VMs

List and manage Hyper-V virtual machines on a Windows host:

```bash
mcp-ssh-client hyperv --host windows-server.com --username admin --list
```

Options:
- `-l, --list`: List all VMs
- `-i, --info <name>`: Get detailed information about a VM
- `-s, --start <name>`: Start a VM
- `-S, --stop <name>`: Stop a VM
- `-f, --force`: Force stop a VM (use with --stop)
- `--delete <name>`: Delete a VM
- `--remove-disks`: Remove disks when deleting a VM (use with --delete)
- `--host-info`: Get information about the Hyper-V host
- `--switches`: List all virtual switches
- `--attach-iso <name>`: Attach an ISO file to a VM
- `--iso-path <path>`: Path to the ISO file (use with --attach-iso)

#### Create a New VM

Create a new virtual machine on a Windows Hyper-V host:

```bash
mcp-ssh-client hyperv-create --host windows-server.com --username admin --name "UbuntuVM" --memory 4 --cpu 2 --disk 60 --iso "C:\path\to\ubuntu.iso"
```

Options:
- `-n, --name <name>`: Name for the new VM
- `-m, --memory <memory>`: Memory in GB for the VM
- `-c, --cpu <count>`: Number of CPU cores for the VM
- `-d, --disk <size>`: Disk size in GB for the VM
- `-s, --switch <name>`: Virtual switch to connect the VM to
- `-g, --generation <number>`: VM generation (1 or 2, default: 2)
- `-i, --iso <path>`: Path to ISO file for OS installation
- `--vhd <path>`: Custom path for the virtual hard disk

## Authentication Methods

The client supports multiple authentication methods:

### SSH Key Authentication (Recommended)

Use your SSH private key for secure authentication:

```bash
mcp-ssh-client connect --host example.com --key ~/.ssh/id_rsa
```

If your key requires a passphrase:

```bash
mcp-ssh-client connect --host example.com --key ~/.ssh/id_rsa --passphrase "your-passphrase"
```

### SSH Config File

Leverage your existing SSH config file:

```bash
mcp-ssh-client connect --host example.com --config ~/.ssh/config
```

This will use all settings from your SSH config file including hostname, port, user, and identity files.

### SSH Agent

Use your SSH agent for passwordless authentication:

```bash
ssh-add ~/.ssh/id_rsa  # Add your key to the SSH agent first
mcp-ssh-client connect --host example.com
```

### Password Authentication

For cases where key authentication isn't possible:

```bash
mcp-ssh-client connect --host example.com -P  # Will prompt for password
```

Or non-interactively (less secure):

```bash
mcp-ssh-client connect --host example.com --pwd "your-password"
```

## Interactive Mode

If you run any command without all required options, the client will prompt you interactively for the missing information.

Example:
```bash
mcp-ssh-client connect
```

This will guide you through an interactive setup process with prompts for:
- Server hostname
- SSH port
- Username
- Authentication method (SSH agent, SSH config, private key, or password)
- Selection of available private keys (if using key authentication)
- Passphrase for your key (if required)
- Password (if using password authentication)

## Diagnostic Capabilities

The client can check and report on:

- System information
- Disk space usage
- Memory utilization
- CPU load
- Network status
- Running processes
- System logs
- Service status

## Troubleshooting Capabilities

Based on diagnostic results, the client can suggest and execute actions like:

- Cleaning up disk space
- Finding large files
- Identifying memory-intensive processes
- Checking network connectivity
- Analyzing recent error logs
- Verifying service status

## Development

### Project Structure

- `src/index.ts`: Main CLI application
- `src/lib/ssh-client.ts`: SSH connection management
- `src/lib/diagnostics.ts`: System diagnostic tools
- `src/lib/troubleshooter.ts`: Troubleshooting logic
- `src/lib/reporter.ts`: Report generation
- `src/lib/hyperv-manager.ts`: Hyper-V virtual machine management

### Build and Test

```bash
# Build TypeScript
npm run build

# Run tests
npm test
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Using with Claude Code

This tool is designed to work seamlessly with Claude Code, allowing you to manage remote servers directly from your chat interface.

### Example workflows:

1. **Basic server diagnostics:**
   ```
   ./dist/index.js connect --host your-server.com --username admin
   ```

2. **Create and manage a Hyper-V VM from macOS:**
   ```
   ./dist/index.js hyperv-create --host windows-host.com --username admin --name "UbuntuVM" --memory 4 --cpu 2 --disk 60
   ./dist/index.js hyperv --host windows-host.com --username admin --attach-iso "UbuntuVM" --iso-path "F:\isos\ubuntu.iso"
   ./dist/index.js hyperv --host windows-host.com --username admin --start "UbuntuVM"
   ```

3. **Run a command on multiple servers:**
   ```
   ./dist/index.js multi --hosts "server1.com,server2.com,192.168.1.10" --username admin --command "df -h"
   ```

4. **Check for updates on a Windows server:**
   ```
   ./dist/index.js run --host windows-server.com --username admin --command "systeminfo"
   ```