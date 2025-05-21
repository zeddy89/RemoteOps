#!/usr/bin/env node
import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SSHClient, SSHConnectionConfig } from './lib/ssh-client';
import { DiagnosticRunner, DiagnosticResult } from './lib/diagnostics';
import { Troubleshooter } from './lib/troubleshooter';
import { Reporter } from './lib/reporter';
import { HyperVManager, CreateVMOptions } from './lib/hyperv-manager';

// Define program version and description
program
  .version('1.0.0')
  .description('MCP SSH Client for server diagnostics and troubleshooting');

// Define commands
program
  .command('connect')
  .description('Connect to a server and run diagnostics')
  .option('-h, --host <host>', 'Server hostname or IP address')
  .option('-p, --port <port>', 'SSH port (default: 22)')
  .option('-u, --username <username>', 'SSH username')
  .option('-k, --key <key_path>', 'Path to private key file')
  .option('-P, --password', 'Use password authentication')
  .option('--pwd <password>', 'SSH password (use with caution as it may be visible in command history)')
  .option('--passphrase <passphrase>', 'Passphrase for encrypted private key')
  .option('--config <path>', 'Path to SSH config file (default: ~/.ssh/config)')
  .option('--no-agent', 'Disable SSH agent usage')
  .option('-r, --report <format>', 'Generate report in specified format (json, html)')
  .option('--non-interactive', 'Run in non-interactive mode without prompts')
  .action(async (options) => {
    try {
      const config = await promptForMissingConfig(options);
      const client = new SSHClient(config);
      
      console.log(chalk.blue('Connecting to server...'));
      await client.connect();
      console.log(chalk.green('✓ Connected successfully'));
      
      const diagnosticRunner = new DiagnosticRunner(client);
      const troubleshooter = new Troubleshooter(client);
      const reporter = new Reporter();
      
      // Execute basic system checks
      console.log(chalk.blue('\nRunning basic system diagnostics...'));
      const diagnosticResults = await diagnosticRunner.runBasicSystemChecks();
      
      // Display the results
      console.log(reporter.formatDiagnosticResults(diagnosticResults));
      
      // Analyze results and suggest troubleshooting actions
      const actions = await troubleshooter.analyzeDiagnostics(diagnosticResults);
      
      let selectedActionIndices: number[] = [];
      
      if (options.nonInteractive) {
        // In non-interactive mode, don't prompt for actions
        console.log(chalk.blue('\nRunning in non-interactive mode, skipping action selection.'));
      } else {
        // Ask which actions to execute
        const { selectedActions } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedActions',
            message: 'Select troubleshooting actions to perform:',
            choices: actions.map((action, index) => ({
              name: `${action.name} - ${action.description}`,
              value: index
            }))
          }
        ]);
        selectedActionIndices = selectedActions;
      }
      
      // Execute selected actions
      const troubleshootingResults: Record<string, string> = {};
      for (const actionIndex of selectedActionIndices) {
        const action = actions[actionIndex];
        console.log(chalk.blue(`\nExecuting: ${action.name}`));
        const output = await troubleshooter.executeAction(action);
        troubleshootingResults[action.name] = output;
        console.log(reporter.formatActionResult(action.name, output));
      }
      
      // Skip custom issue in non-interactive mode
      if (!options.nonInteractive) {
        // Ask for custom issue
        const { customIssue } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customIssue',
            message: 'Describe any specific issue you want to troubleshoot (or press enter to skip):',
          }
        ]);
        
        if (customIssue) {
          const customActions = await troubleshooter.getCustomActionForIssue(customIssue);
          if (customActions.length > 0) {
            const { selectedCustomActions } = await inquirer.prompt([
              {
                type: 'checkbox',
                name: 'selectedCustomActions',
                message: `Select actions for troubleshooting "${customIssue}":`,
                choices: customActions.map((action, index) => ({
                  name: `${action.name} - ${action.description}`,
                  value: index
                }))
              }
            ]);
            
            for (const actionIndex of selectedCustomActions) {
              const action = customActions[actionIndex];
              console.log(chalk.blue(`\nExecuting: ${action.name}`));
              const output = await troubleshooter.executeAction(action);
              troubleshootingResults[action.name] = output;
              console.log(reporter.formatActionResult(action.name, output));
            }
          } else {
            console.log(chalk.yellow('No specific troubleshooting actions found for the described issue.'));
          }
        }
      }
      
      // Generate report if requested
      if (options.report) {
        const systemInfo = (await client.executeCommand('uname -a && hostname && uptime')).stdout;
        const reportData = {
          timestamp: new Date().toISOString(),
          systemInfo,
          diagnostics: diagnosticResults,
          troubleshooting: troubleshootingResults
        };
        
        let reportPath;
        if (options.report === 'json') {
          reportPath = reporter.saveReportToFile(reportData);
          console.log(chalk.green(`\nJSON report saved to: ${reportPath}`));
        } else if (options.report === 'html') {
          reportPath = reporter.generateHtmlReport(reportData);
          console.log(chalk.green(`\nHTML report saved to: ${reportPath}`));
        }
      }
      
      // Skip interactive shell in non-interactive mode
      if (options.nonInteractive) {
        // Disconnect if in non-interactive mode
        client.disconnect();
        console.log(chalk.blue('\nDisconnected from server.'));
      } else {
        // Ask if user wants to open interactive shell
        const { openShell } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'openShell',
            message: 'Would you like to open an interactive shell session?',
            default: false
          }
        ]);
        
        if (openShell) {
          console.log(chalk.blue('\nOpening interactive shell. Type "exit" to close the connection.'));
          const shell = await client.getInteractiveShell();
          
          // Connect the shell to stdin/stdout
          process.stdin.setRawMode(true);
          process.stdin.pipe(shell);
          shell.pipe(process.stdout);
          
          shell.on('close', () => {
            process.stdin.setRawMode(false);
            process.stdin.unpipe(shell);
            shell.unpipe(process.stdout);
            console.log(chalk.blue('\nShell session closed.'));
            client.disconnect();
            process.exit(0);
          });
        } else {
          // Disconnect if not using shell
          client.disconnect();
          console.log(chalk.blue('\nDisconnected from server.'));
        }
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
  });

program
  .command('troubleshoot')
  .description('Directly troubleshoot a specific issue')
  .option('-h, --host <host>', 'Server hostname or IP address')
  .option('-p, --port <port>', 'SSH port (default: 22)')
  .option('-u, --username <username>', 'SSH username')
  .option('-k, --key <key_path>', 'Path to private key file')
  .option('-P, --password', 'Use password authentication')
  .option('-i, --issue <issue>', 'Issue description (e.g., "slow performance", "disk space")')
  .action(async (options) => {
    try {
      if (!options.issue) {
        const { issue } = await inquirer.prompt([
          {
            type: 'input',
            name: 'issue',
            message: 'Describe the issue you want to troubleshoot:',
            validate: (input: string) => input ? true : 'Please describe the issue'
          }
        ]);
        options.issue = issue;
      }
      
      const config = await promptForMissingConfig(options);
      const client = new SSHClient(config);
      
      console.log(chalk.blue('Connecting to server...'));
      await client.connect();
      console.log(chalk.green('✓ Connected successfully'));
      
      const troubleshooter = new Troubleshooter(client);
      const reporter = new Reporter();
      
      // Get actions for the specific issue
      const actions = await troubleshooter.getCustomActionForIssue(options.issue);
      
      if (actions.length === 0) {
        console.log(chalk.yellow('No specific troubleshooting actions found for the described issue.'));
        console.log(chalk.blue('Running general diagnostics instead...'));
        
        const diagnosticRunner = new DiagnosticRunner(client);
        const diagnosticResults = await diagnosticRunner.runBasicSystemChecks();
        console.log(reporter.formatDiagnosticResults(diagnosticResults));
      } else {
        // Execute all actions for this issue
        for (const action of actions) {
          console.log(chalk.blue(`\nExecuting: ${action.name}`));
          const output = await troubleshooter.executeAction(action);
          console.log(reporter.formatActionResult(action.name, output));
        }
      }
      
      client.disconnect();
      console.log(chalk.blue('\nDisconnected from server.'));
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
  });

program
  .command('updates')
  .description('Check for pending system updates')
  .option('-h, --host <host>', 'Server hostname or IP address')
  .option('-p, --port <port>', 'SSH port (default: 22)')
  .option('-u, --username <username>', 'SSH username')
  .option('-k, --key <key_path>', 'Path to private key file')
  .option('-P, --password', 'Use password authentication')
  .option('--pwd <password>', 'SSH password (use with caution as it may be visible in command history)')
  .option('--passphrase <passphrase>', 'Passphrase for encrypted private key')
  .option('--config <path>', 'Path to SSH config file (default: ~/.ssh/config)')
  .option('--no-agent', 'Disable SSH agent usage')
  .action(async (options) => {
    try {
      const config = await promptForMissingConfig(options);
      const client = new SSHClient(config);
      
      console.log(chalk.blue('Connecting to server...'));
      await client.connect();
      console.log(chalk.green('✓ Connected successfully'));
      
      const diagnosticRunner = new DiagnosticRunner(client);
      
      // Check only for updates
      console.log(chalk.blue('\nChecking for pending updates...'));
      const updateResult = await diagnosticRunner.checkPendingUpdates();
      
      // Format and display the results
      const statusColor = 
        updateResult.status === 'success' ? chalk.green :
        updateResult.status === 'warning' ? chalk.yellow :
        chalk.red;
      
      console.log(statusColor(`[${updateResult.status.toUpperCase()}] ${updateResult.name}`));
      console.log('--------------------------------');
      console.log(updateResult.output);
      
      if (updateResult.details) {
        console.log(statusColor(`\nSummary: ${updateResult.details}`));
      }
      
      // Disconnect
      client.disconnect();
      console.log(chalk.blue('\nDisconnected from server.'));
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
  });

program
  .command('run')
  .description('Run a custom command on the server')
  .option('-h, --host <host>', 'Server hostname or IP address')
  .option('-p, --port <port>', 'SSH port (default: 22)')
  .option('-u, --username <username>', 'SSH username')
  .option('-k, --key <key_path>', 'Path to private key file')
  .option('-P, --password', 'Use password authentication')
  .option('--pwd <password>', 'SSH password (use with caution as it may be visible in command history)')
  .option('--passphrase <passphrase>', 'Passphrase for encrypted private key')
  .option('--config <path>', 'Path to SSH config file (default: ~/.ssh/config)')
  .option('--no-agent', 'Disable SSH agent usage')
  .option('-c, --command <command>', 'Command to execute')
  .action(async (options) => {
    try {
      if (!options.command) {
        const { command } = await inquirer.prompt([
          {
            type: 'input',
            name: 'command',
            message: 'Enter the command to run:',
            validate: (input: string) => input ? true : 'Please enter a command'
          }
        ]);
        options.command = command;
      }
      
      const config = await promptForMissingConfig(options);
      const client = new SSHClient(config);
      
      console.log(chalk.blue('Connecting to server...'));
      await client.connect();
      console.log(chalk.green('✓ Connected successfully'));
      
      console.log(chalk.blue(`\nExecuting: ${options.command}`));
      const { stdout, stderr, code } = await client.executeCommand(options.command);
      console.log(chalk.yellow('Output:'));
      console.log(stdout || stderr);
      
      console.log(chalk.blue(`\nCommand exited with code: ${code}`));
      
      client.disconnect();
      console.log(chalk.blue('\nDisconnected from server.'));
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
  });

// Function to prompt for missing configuration
async function promptForMissingConfig(options: any): Promise<SSHConnectionConfig> {
  const questions = [];
  
  if (!options.host) {
    questions.push({
      type: 'input',
      name: 'host',
      message: 'Server hostname or IP address:',
      validate: (input: string) => input ? true : 'Server hostname is required'
    });
  }
  
  if (!options.port) {
    questions.push({
      type: 'input',
      name: 'port',
      message: 'SSH port:',
      default: '22',
      validate: (input: string) => /^\d+$/.test(input) ? true : 'Port must be a number'
    });
  }
  
  if (!options.username) {
    const defaultUser = os.userInfo().username;
    questions.push({
      type: 'input',
      name: 'username',
      message: 'SSH username:',
      default: defaultUser
    });
  }
  
  // Check if direct password was provided
  if (options.pwd) {
    // Use the direct password if provided
    return {
      host: options.host || (await inquirer.prompt(questions.filter(q => q.name === 'host'))).host,
      port: parseInt(options.port || (questions.some(q => q.name === 'port') ? 
            (await inquirer.prompt(questions.filter(q => q.name === 'port'))).port : '22'), 10),
      username: options.username || (questions.some(q => q.name === 'username') ? 
               (await inquirer.prompt(questions.filter(q => q.name === 'username'))).username : os.userInfo().username),
      password: options.pwd,
      passphrase: options.passphrase,
      configFile: options.config,
      useAgent: options.agent !== false
    };
  }
  
  // Determine authentication method and key to use
  let authMethod = '';
  let selectedKeyPath = '';
  
  if (!options.key && !options.password) {
    const defaultKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa');
    const sshConfigExists = fs.existsSync(path.join(os.homedir(), '.ssh', 'config'));
    const hasDefaultKey = fs.existsSync(defaultKeyPath);
    const hasSSHAgent = !!process.env.SSH_AUTH_SOCK;
    
    const authChoices = [];
    
    if (hasSSHAgent) {
      authChoices.push({ 
        name: 'SSH Agent',
        value: 'agent'
      });
    }
    
    if (sshConfigExists) {
      authChoices.push({ 
        name: 'SSH Config File',
        value: 'config'
      });
    }
    
    authChoices.push({ 
      name: `Private key${hasDefaultKey ? ` (default: ${defaultKeyPath})` : ''}`,
      value: 'key'
    });
    
    authChoices.push({ 
      name: 'Password',
      value: 'password'
    });
    
    questions.push({
      type: 'list',
      name: 'authMethod',
      message: 'Authentication method:',
      choices: authChoices,
      default: hasSSHAgent ? 'agent' : (sshConfigExists ? 'config' : (hasDefaultKey ? 'key' : 'password'))
    });
    
    const authAnswer = await inquirer.prompt([questions.pop() as any]);
    authMethod = authAnswer.authMethod;
  } else {
    authMethod = options.key ? 'key' : 'password';
  }
  
  // Handle authentication method specific prompts
  if (authMethod === 'config' || options.config) {
    const defaultConfigPath = path.join(os.homedir(), '.ssh', 'config');
    if (!options.config) {
      questions.push({
        type: 'input',
        name: 'configPath',
        message: 'Path to SSH config file:',
        default: defaultConfigPath,
        validate: (input: string) => 
          input && fs.existsSync(input) ? true : 'Please provide a valid path to SSH config file'
      });
    }
  } else if (authMethod === 'key' && !options.key) {
    // Find available key files in .ssh directory
    const sshDir = path.join(os.homedir(), '.ssh');
    const keyFiles = [];
    
    if (fs.existsSync(sshDir)) {
      try {
        const files = fs.readdirSync(sshDir);
        for (const file of files) {
          const filePath = path.join(sshDir, file);
          if (fs.statSync(filePath).isFile() && 
              !file.endsWith('.pub') && 
              !file.includes('known_hosts') && 
              !file.includes('config') &&
              !file.includes('authorized_keys')) {
            keyFiles.push(filePath);
          }
        }
      } catch (error) {
        console.error(`Error reading .ssh directory: ${error}`);
      }
    }
    
    if (keyFiles.length > 0) {
      questions.push({
        type: 'list',
        name: 'key',
        message: 'Select private key:',
        choices: [...keyFiles, { name: 'Enter custom path...', value: 'custom' }],
        default: keyFiles.includes(path.join(os.homedir(), '.ssh', 'id_rsa')) ? 
                 path.join(os.homedir(), '.ssh', 'id_rsa') : keyFiles[0]
      });
      
      const keyAnswer = await inquirer.prompt([questions.pop() as any]);
      
      if (keyAnswer.key === 'custom') {
        questions.push({
          type: 'input',
          name: 'key',
          message: 'Path to private key:',
          validate: (input: string) => 
            input && fs.existsSync(input) ? true : 'Please provide a valid path to your private key'
        });
      } else {
        selectedKeyPath = keyAnswer.key;
        
        questions.push({
          type: 'confirm',
          name: 'hasPassphrase',
          message: 'Does this key have a passphrase?',
          default: false
        });
        
        const { hasPassphrase } = await inquirer.prompt([questions.pop() as any]);
        
        if (hasPassphrase && !options.passphrase) {
          questions.push({
            type: 'password',
            name: 'passphrase',
            message: 'Key passphrase:',
            validate: (input: string) => input ? true : 'Passphrase is required'
          });
        }
      }
    } else {
      // No key files found, ask for path
      questions.push({
        type: 'input',
        name: 'key',
        message: 'Path to private key:',
        validate: (input: string) => 
          input && fs.existsSync(input) ? true : 'Please provide a valid path to your private key'
      });
    }
  }
  
  let passwordPrompt = null;
  if (authMethod === 'password') {
    passwordPrompt = {
      type: 'password',
      name: 'password',
      message: 'SSH password:',
      validate: (input: string) => input ? true : 'Password is required'
    };
  }
  
  const answers = await inquirer.prompt(questions);
  
  // Handle password separately to keep it secure
  let password = '';
  if (passwordPrompt) {
    password = (await inquirer.prompt([passwordPrompt])).password;
  }
  
  // Prepare the config object
  const config: SSHConnectionConfig = {
    host: options.host || answers.host,
    port: parseInt(options.port || answers.port, 10),
    username: options.username || answers.username,
    useAgent: options.agent !== false && authMethod === 'agent'
  };
  
  // Set authentication details based on method
  if (authMethod === 'password' || options.password) {
    config.password = password || undefined;
  } else if (authMethod === 'key' || options.key) {
    config.privateKey = options.key || answers.key || selectedKeyPath;
    config.passphrase = options.passphrase || answers.passphrase;
  } else if (authMethod === 'config' || options.config) {
    config.configFile = options.config || answers.configPath;
  }
  
  return config;
}

program
  .command('multi-diag')
  .description('Run basic diagnostics on multiple servers')
  .option('-h, --hosts <hosts>', 'Comma-separated list of hostnames or IP addresses')
  .option('-p, --port <port>', 'SSH port (default: 22)')
  .option('-u, --username <username>', 'SSH username')
  .option('-k, --key <key_path>', 'Path to private key file')
  .option('-P, --password', 'Use password authentication')
  .option('--pwd <password>', 'SSH password (use with caution as it may be visible in command history)')
  .option('--passphrase <passphrase>', 'Passphrase for encrypted private key')
  .option('--config <path>', 'Path to SSH config file (default: ~/.ssh/config)')
  .option('--no-agent', 'Disable SSH agent usage')
  .option('-r, --report <format>', 'Generate report in specified format (json, html)')
  .action(async (options) => {
    try {
      if (!options.hosts) {
        const { hosts } = await inquirer.prompt([
          {
            type: 'input',
            name: 'hosts',
            message: 'Enter comma-separated list of server hostnames or IPs:',
            validate: (input: string) => input ? true : 'At least one host is required'
          }
        ]);
        options.hosts = hosts;
      }
      
      const hostList = options.hosts.split(',').map((host: string) => host.trim());
      
      // Setup base configuration
      const baseConfig: any = {};
      if (options.port) baseConfig.port = parseInt(options.port, 10);
      if (options.username) baseConfig.username = options.username;
      if (options.key) baseConfig.privateKey = options.key;
      if (options.pwd) baseConfig.password = options.pwd;
      
      // Store diagnostic results for all servers
      const allResults: Record<string, DiagnosticResult[]> = {};
      
      console.log(chalk.blue(`\nRunning diagnostics on ${hostList.length} servers...\n`));
      
      for (const host of hostList) {
        try {
          console.log(chalk.yellow(`--- Server: ${host} ---`));
          
          // Create config for this host
          const config = { ...baseConfig, host };
          
          // If no direct password was provided and password auth was selected,
          // prompt for the password for each server
          if (!config.password && !config.privateKey && options.password) {
            const { serverPassword } = await inquirer.prompt([
              {
                type: 'password',
                name: 'serverPassword',
                message: `SSH password for ${host}:`,
                validate: (input: string) => input ? true : 'Password is required'
              }
            ]);
            config.password = serverPassword;
          }
          
          // Connect
          console.log(chalk.blue('Connecting to server...'));
          const client = new SSHClient(config);
          await client.connect();
          console.log(chalk.green('✓ Connected successfully'));
          
          // Run diagnostics
          console.log(chalk.blue('\nRunning basic system diagnostics...'));
          const diagnosticRunner = new DiagnosticRunner(client);
          const diagnosticResults = await diagnosticRunner.runBasicSystemChecks();
          
          // Display the results
          const reporter = new Reporter();
          console.log(reporter.formatDiagnosticResults(diagnosticResults));
          
          // Store results for this host
          allResults[host] = diagnosticResults;
          
          // Generate report if requested
          if (options.report) {
            const systemInfo = (await client.executeCommand('uname -a && hostname && uptime')).stdout;
            const reportData = {
              timestamp: new Date().toISOString(),
              host,
              systemInfo,
              diagnostics: diagnosticResults
            };
            
            let reportPath;
            if (options.report === 'json') {
              reportPath = reporter.saveReportToFile(reportData, `diagnostic-report-${host}-${Date.now()}.json`);
              console.log(chalk.green(`\nJSON report saved to: ${reportPath}`));
            } else if (options.report === 'html') {
              reportPath = reporter.generateHtmlReport(reportData, `diagnostic-report-${host}-${Date.now()}.html`);
              console.log(chalk.green(`\nHTML report saved to: ${reportPath}`));
            }
          }
          
          // Disconnect
          client.disconnect();
          console.log(chalk.blue('\nDisconnected from server.'));
          
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`Error on ${host}: ${errorMessage}`));
          
          // Store error status for this host
          allResults[host] = [{
            name: 'Connection Error',
            status: 'error',
            output: errorMessage
          }];
        }
        
        console.log(); // Add an empty line between servers
      }
      
      // Display summary
      console.log(chalk.blue('\n=== SUMMARY ==='));
      for (const host of hostList) {
        if (allResults[host]) {
          const results = allResults[host];
          const hasErrors = results.some(r => r.status === 'error');
          const hasWarnings = results.some(r => r.status === 'warning');
          
          if (hasErrors) {
            console.log(chalk.red(`✗ ${host}: Errors detected`));
          } else if (hasWarnings) {
            console.log(chalk.yellow(`⚠ ${host}: Warnings detected`));
          } else {
            console.log(chalk.green(`✓ ${host}: All systems healthy`));
          }
        } else {
          console.log(chalk.red(`✗ ${host}: Failed to connect`));
        }
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
  });

program
  .command('multi')
  .description('Run a command on multiple servers')
  .option('-h, --hosts <hosts>', 'Comma-separated list of hostnames or IP addresses')
  .option('-p, --port <port>', 'SSH port (default: 22)')
  .option('-u, --username <username>', 'SSH username')
  .option('-k, --key <key_path>', 'Path to private key file')
  .option('-P, --password', 'Use password authentication')
  .option('--pwd <password>', 'SSH password (use with caution as it may be visible in command history)')
  .option('--passphrase <passphrase>', 'Passphrase for encrypted private key')
  .option('--config <path>', 'Path to SSH config file (default: ~/.ssh/config)')
  .option('--no-agent', 'Disable SSH agent usage')
  .option('-c, --command <command>', 'Command to execute on all servers')
  .action(async (options) => {
    try {
      if (!options.hosts) {
        const { hosts } = await inquirer.prompt([
          {
            type: 'input',
            name: 'hosts',
            message: 'Enter comma-separated list of server hostnames or IPs:',
            validate: (input: string) => input ? true : 'At least one host is required'
          }
        ]);
        options.hosts = hosts;
      }
      
      if (!options.command) {
        const { command } = await inquirer.prompt([
          {
            type: 'input',
            name: 'command',
            message: 'Enter the command to run on all servers:',
            validate: (input: string) => input ? true : 'Command is required'
          }
        ]);
        options.command = command;
      }
      
      const hostList = options.hosts.split(',').map((host: string) => host.trim());
      
      // Setup base configuration
      const baseConfig: any = {};
      if (options.port) baseConfig.port = parseInt(options.port, 10);
      if (options.username) baseConfig.username = options.username;
      if (options.key) baseConfig.privateKey = options.key;
      if (options.pwd) baseConfig.password = options.pwd;
      
      // Handle results for multiple servers
      const results = [];
      
      console.log(chalk.blue(`\nExecuting command on ${hostList.length} servers...\n`));
      
      for (const host of hostList) {
        try {
          console.log(chalk.yellow(`--- Server: ${host} ---`));
          
          // Create config for this host
          const config = { ...baseConfig, host };
          
          // If no direct password was provided and password auth was selected,
          // prompt for the password for each server
          if (!config.password && !config.privateKey && options.password) {
            const { serverPassword } = await inquirer.prompt([
              {
                type: 'password',
                name: 'serverPassword',
                message: `SSH password for ${host}:`,
                validate: (input: string) => input ? true : 'Password is required'
              }
            ]);
            config.password = serverPassword;
          }
          
          // Connect
          console.log(chalk.blue('Connecting to server...'));
          const client = new SSHClient(config);
          await client.connect();
          console.log(chalk.green('✓ Connected successfully'));
          
          // Execute command
          console.log(chalk.blue(`\nExecuting: ${options.command}`));
          const { stdout, stderr, code } = await client.executeCommand(options.command);
          console.log(chalk.yellow('Output:'));
          console.log(stdout || stderr);
          console.log(chalk.blue(`\nCommand exited with code: ${code}`));
          
          // Store result
          results.push({
            host,
            success: true,
            output: stdout || stderr,
            code
          });
          
          // Disconnect
          client.disconnect();
          console.log(chalk.blue('\nDisconnected from server.'));
          
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`Error on ${host}: ${errorMessage}`));
          
          // Store error result
          results.push({
            host,
            success: false,
            error: errorMessage
          });
        }
        
        console.log(); // Add an empty line between servers
      }
      
      // Display summary
      console.log(chalk.blue('\n=== SUMMARY ==='));
      for (const result of results) {
        if (result.success) {
          console.log(chalk.green(`✓ ${result.host}: Command completed with exit code ${result.code}`));
        } else {
          console.log(chalk.red(`✗ ${result.host}: Failed - ${result.error}`));
        }
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
  });

// Hyper-V VM management commands
program
  .command('hyperv')
  .description('Manage Hyper-V virtual machines')
  .option('-h, --host <host>', 'Hyper-V Windows host')
  .option('-p, --port <port>', 'SSH port (default: 22)')
  .option('-u, --username <username>', 'Windows username')
  .option('-k, --key <key_path>', 'Path to private key file')
  .option('-P, --password', 'Use password authentication')
  .option('--pwd <password>', 'SSH password (use with caution as it may be visible in command history)')
  .option('--passphrase <passphrase>', 'Passphrase for encrypted private key')
  .option('--config <path>', 'Path to SSH config file (default: ~/.ssh/config)')
  .option('--no-agent', 'Disable SSH agent usage')
  .option('-l, --list', 'List all VMs')
  .option('-i, --info <name>', 'Get detailed information about a VM')
  .option('-s, --start <name>', 'Start a VM')
  .option('-S, --stop <name>', 'Stop a VM')
  .option('-f, --force', 'Force stop a VM (use with --stop)')
  .option('--delete <name>', 'Delete a VM')
  .option('--remove-disks', 'Remove disks when deleting a VM (use with --delete)')
  .option('--host-info', 'Get information about the Hyper-V host')
  .option('--switches', 'List all virtual switches')
  .option('--attach-iso <name>', 'Attach an ISO file to a VM')
  .option('--iso-path <path>', 'Path to the ISO file (use with --attach-iso)')
  .action(async (options) => {
    try {
      const config = await promptForMissingConfig(options);
      const client = new SSHClient(config);
      
      console.log(chalk.blue('Connecting to Windows Hyper-V host...'));
      await client.connect();
      console.log(chalk.green('✓ Connected successfully'));
      
      const hyperv = new HyperVManager(client);
      
      // Handle different command options
      if (options.list) {
        // List all VMs
        console.log(chalk.blue('\nRetrieving list of virtual machines...'));
        const vms = await hyperv.listVMs();
        
        if (vms.length === 0) {
          console.log(chalk.yellow('No virtual machines found.'));
        } else {
          console.log(chalk.bold('\nVirtual Machines:'));
          vms.forEach(vm => {
            const stateColor = vm.state === 'Running' ? chalk.green : 
                              (vm.state === 'Off' ? chalk.red : chalk.yellow);
            console.log(`${chalk.bold(vm.name)} - State: ${stateColor(vm.state)}`);
            if (vm.memoryAssigned) console.log(`  Memory: ${vm.memoryAssigned}`);
            if (vm.cpuUsage) console.log(`  CPU Usage: ${vm.cpuUsage}%`);
            if (vm.uptime) console.log(`  Uptime: ${vm.uptime}`);
            console.log();
          });
        }
      } else if (options.info) {
        // Get VM details
        console.log(chalk.blue(`\nRetrieving details for VM: ${options.info}...`));
        const vmInfo = await hyperv.getVMDetails(options.info);
        
        console.log(chalk.bold(`\nVM: ${vmInfo.name}`));
        console.log(`State: ${vmInfo.state === 'Running' ? chalk.green(vmInfo.state) : 
                            (vmInfo.state === 'Off' ? chalk.red(vmInfo.state) : chalk.yellow(vmInfo.state))}`);
        console.log(`Generation: ${vmInfo.generation}`);
        console.log(`Memory: ${vmInfo.memoryAssigned}`);
        console.log(`Dynamic Memory: ${vmInfo.dynamicMemoryEnabled ? 'Enabled' : 'Disabled'}`);
        if (vmInfo.cpuUsage) console.log(`CPU Usage: ${vmInfo.cpuUsage}%`);
        if (vmInfo.uptime) console.log(`Uptime: ${vmInfo.uptime}`);
        
        if (vmInfo.networkAdapters && vmInfo.networkAdapters.length > 0) {
          console.log(chalk.bold('\nNetwork Adapters:'));
          vmInfo.networkAdapters.forEach((adapter, i) => {
            console.log(`  ${i+1}: ${adapter}`);
          });
        }
        
        if (vmInfo.hardDrives && vmInfo.hardDrives.length > 0) {
          console.log(chalk.bold('\nHard Drives:'));
          vmInfo.hardDrives.forEach((drive, i) => {
            console.log(`  ${i+1}: ${drive}`);
          });
        }
      } else if (options.start) {
        // Start VM
        console.log(chalk.blue(`\nStarting VM: ${options.start}...`));
        await hyperv.startVM(options.start);
        console.log(chalk.green(`✓ VM ${options.start} started successfully`));
      } else if (options.stop) {
        // Stop VM
        console.log(chalk.blue(`\nStopping VM: ${options.stop}${options.force ? ' (forced)' : ''}...`));
        await hyperv.stopVM(options.stop, options.force);
        console.log(chalk.green(`✓ VM ${options.stop} stopped successfully`));
      } else if (options.delete) {
        // Delete VM
        console.log(chalk.blue(`\nDeleting VM: ${options.delete}${options.removeDisks ? ' (including disks)' : ''}...`));
        
        // Ask for confirmation
        if (!options.nonInteractive) {
          const { confirmDelete } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmDelete',
            message: `Are you sure you want to delete the VM '${options.delete}'? This cannot be undone.`,
            default: false
          }]);
          
          if (!confirmDelete) {
            console.log(chalk.yellow('Delete operation cancelled.'));
            client.disconnect();
            return;
          }
        }
        
        await hyperv.deleteVM(options.delete, options.removeDisks);
        console.log(chalk.green(`✓ VM ${options.delete} deleted successfully`));
      } else if (options.hostInfo) {
        // Get host information
        console.log(chalk.blue('\nRetrieving Hyper-V host information...'));
        const hostInfo = await hyperv.getHostInfo();
        
        console.log(chalk.bold('\nHyper-V Host Information:'));
        console.log(`Computer Name: ${hostInfo.CsName}`);
        console.log(`Domain: ${hostInfo.CsDomain || 'Not in a domain'}`);
        console.log(`Operating System: ${hostInfo.OsName}`);
        console.log(`OS Version: ${hostInfo.OsVersion}`);
        console.log(`Processors: ${hostInfo.CsNumberOfLogicalProcessors} logical processors (${hostInfo.CsNumberOfProcessors} physical)`);
        
        const totalMemoryGB = hostInfo.OsTotalVisibleMemorySize / 1024 / 1024;
        const freeMemoryGB = hostInfo.OsFreePhysicalMemory / 1024 / 1024;
        const usedMemoryGB = totalMemoryGB - freeMemoryGB;
        const memoryUsagePercent = (usedMemoryGB / totalMemoryGB) * 100;
        
        console.log(`Total Memory: ${totalMemoryGB.toFixed(2)} GB`);
        console.log(`Free Memory: ${freeMemoryGB.toFixed(2)} GB (${(100 - memoryUsagePercent).toFixed(2)}%)`);
        console.log(`Used Memory: ${usedMemoryGB.toFixed(2)} GB (${memoryUsagePercent.toFixed(2)}%)`);
      } else if (options.switches) {
        // List virtual switches
        console.log(chalk.blue('\nRetrieving virtual switches...'));
        const switches = await hyperv.listSwitches();
        
        if (switches.length === 0) {
          console.log(chalk.yellow('No virtual switches found.'));
        } else {
          console.log(chalk.bold('\nVirtual Switches:'));
          switches.forEach(sw => {
            console.log(`${chalk.bold(sw.Name)} - Type: ${sw.SwitchType}`);
            if (sw.NetAdapterInterfaceDescription) {
              console.log(`  Connected to: ${sw.NetAdapterInterfaceDescription}`);
            }
            console.log();
          });
        }
      } else if (options.attachIso) {
        // Check if iso path is provided
        if (!options.isoPath) {
          console.log(chalk.red('Error: --iso-path is required when using --attach-iso'));
          client.disconnect();
          process.exit(1);
        }
        
        console.log(chalk.blue(`\nAttaching ISO file to VM: ${options.attachIso}...`));
        console.log(`ISO Path: ${options.isoPath}`);
        
        await hyperv.attachISO(options.attachIso, options.isoPath);
        console.log(chalk.green(`✓ ISO attached successfully to VM ${options.attachIso}`));
        
        // Ask if the user wants to start the VM
        if (!options.nonInteractive) {
          const { startVM } = await inquirer.prompt([{
            type: 'confirm',
            name: 'startVM',
            message: `Would you like to start VM '${options.attachIso}' now?`,
            default: true
          }]);
          
          if (startVM) {
            console.log(chalk.blue(`\nStarting VM: ${options.attachIso}...`));
            await hyperv.startVM(options.attachIso);
            console.log(chalk.green(`✓ VM ${options.attachIso} started successfully`));
          }
        }
      } else {
        console.log(chalk.yellow('No action specified. Use --list, --info, --start, --stop, --delete, --host-info, --switches, or --attach-iso'));
      }
      
      // Disconnect
      client.disconnect();
      console.log(chalk.blue('\nDisconnected from Hyper-V host.'));
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
  });

// Create VM command (separated for clarity)
program
  .command('hyperv-create')
  .description('Create a new Hyper-V virtual machine')
  .option('-h, --host <host>', 'Hyper-V Windows host')
  .option('-p, --port <port>', 'SSH port (default: 22)')
  .option('-u, --username <username>', 'Windows username')
  .option('-k, --key <key_path>', 'Path to private key file')
  .option('-P, --password', 'Use password authentication')
  .option('--pwd <password>', 'SSH password (use with caution as it may be visible in command history)')
  .option('--passphrase <passphrase>', 'Passphrase for encrypted private key')
  .option('--config <path>', 'Path to SSH config file (default: ~/.ssh/config)')
  .option('--no-agent', 'Disable SSH agent usage')
  .option('-n, --name <name>', 'Name for the new VM')
  .option('-m, --memory <memory>', 'Memory in GB for the VM')
  .option('-c, --cpu <count>', 'Number of CPU cores for the VM')
  .option('-d, --disk <size>', 'Disk size in GB for the VM')
  .option('-s, --switch <name>', 'Virtual switch to connect the VM to')
  .option('-g, --generation <number>', 'VM generation (1 or 2, default: 2)')
  .option('-i, --iso <path>', 'Path to ISO file for OS installation')
  .option('--vhd <path>', 'Custom path for the virtual hard disk')
  .action(async (options) => {
    try {
      // Check for required parameters
      if (!options.nonInteractive && (!options.name || !options.memory || !options.cpu || !options.disk)) {
        const questions = [];
        
        if (!options.name) {
          questions.push({
            type: 'input',
            name: 'name',
            message: 'Enter a name for the new VM:',
            validate: (input: string) => input ? true : 'VM name is required'
          });
        }
        
        if (!options.memory) {
          questions.push({
            type: 'number',
            name: 'memory',
            message: 'Enter memory in GB for the VM:',
            default: 2,
            validate: (input: number) => input > 0 ? true : 'Memory must be greater than 0'
          });
        }
        
        if (!options.cpu) {
          questions.push({
            type: 'number',
            name: 'cpu',
            message: 'Enter number of CPU cores for the VM:',
            default: 2,
            validate: (input: number) => input > 0 ? true : 'CPU count must be greater than 0'
          });
        }
        
        if (!options.disk) {
          questions.push({
            type: 'number',
            name: 'disk',
            message: 'Enter disk size in GB for the VM:',
            default: 60,
            validate: (input: number) => input > 0 ? true : 'Disk size must be greater than 0'
          });
        }
        
        const answers = await inquirer.prompt(questions);
        options = { ...options, ...answers };
      }
      
      const config = await promptForMissingConfig(options);
      const client = new SSHClient(config);
      
      console.log(chalk.blue('Connecting to Windows Hyper-V host...'));
      await client.connect();
      console.log(chalk.green('✓ Connected successfully'));
      
      const hyperv = new HyperVManager(client);
      
      // Get virtual switches if not specified
      if (!options.switch && !options.nonInteractive) {
        const switches = await hyperv.listSwitches();
        if (switches.length > 0) {
          const { selectedSwitch } = await inquirer.prompt([{
            type: 'list',
            name: 'selectedSwitch',
            message: 'Select a virtual switch for the VM:',
            choices: [
              { name: 'None', value: '' },
              ...switches.map(sw => ({ name: `${sw.Name} (${sw.SwitchType})`, value: sw.Name }))
            ]
          }]);
          options.switch = selectedSwitch;
        }
      }
      
      // Create the VM
      console.log(chalk.blue(`\nCreating new VM: ${options.name}...`));
      console.log(`Memory: ${options.memory} GB, CPUs: ${options.cpu}, Disk: ${options.disk} GB`);
      if (options.switch) console.log(`Network: ${options.switch}`);
      if (options.iso) console.log(`Installation ISO: ${options.iso}`);
      
      const vmOptions: CreateVMOptions = {
        name: options.name,
        memoryInGB: parseFloat(options.memory),
        cpuCount: parseInt(options.cpu, 10),
        diskSizeInGB: parseFloat(options.disk),
        switchName: options.switch,
        generation: options.generation ? parseInt(options.generation, 10) : 2,
        isoPath: options.iso,
        vhdPath: options.vhd
      };
      
      const newVM = await hyperv.createVM(vmOptions);
      
      console.log(chalk.green(`\n✓ VM ${options.name} created successfully!`));
      console.log(chalk.bold('\nVM Details:'));
      console.log(`Name: ${newVM.name}`);
      console.log(`State: ${newVM.state}`);
      console.log(`Generation: ${newVM.generation}`);
      console.log(`Memory: ${newVM.memoryAssigned}`);
      
      if (newVM.networkAdapters && newVM.networkAdapters.length > 0) {
        console.log(chalk.bold('\nNetwork Adapters:'));
        newVM.networkAdapters.forEach((adapter, i) => {
          console.log(`  ${i+1}: ${adapter}`);
        });
      }
      
      if (newVM.hardDrives && newVM.hardDrives.length > 0) {
        console.log(chalk.bold('\nHard Drives:'));
        newVM.hardDrives.forEach((drive, i) => {
          console.log(`  ${i+1}: ${drive}`);
        });
      }
      
      console.log(chalk.bold('\nNext Steps:'));
      if (options.iso) {
        console.log('- The VM is ready with installation media attached.');
        console.log('- Start the VM to begin OS installation:');
        console.log(`  ${chalk.cyan(`mcp-ssh-client hyperv --host ${options.host} --start ${options.name}`)}`);
      } else {
        console.log('- The VM has been created with a blank disk.');
        console.log('- You need to attach installation media before starting it:');
        console.log(`  ${chalk.cyan(`mcp-ssh-client hyperv --host ${options.host} --attach-iso ${options.name} --iso-path "C:\\path\\to\\your.iso"`)}`);
      }
      
      // Disconnect
      client.disconnect();
      console.log(chalk.blue('\nDisconnected from Hyper-V host.'));
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
  });

// Note: The autoinstall feature was removed as it doesn't work properly with Type 2 hypervisor deployments

// Parse arguments and execute
program.parse(process.argv);

// Show help if no arguments
if (process.argv.length <= 2) {
  program.help();
}