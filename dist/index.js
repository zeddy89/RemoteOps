#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const ssh_client_1 = require("./lib/ssh-client");
const diagnostics_1 = require("./lib/diagnostics");
const troubleshooter_1 = require("./lib/troubleshooter");
const reporter_1 = require("./lib/reporter");
const hyperv_manager_1 = require("./lib/hyperv-manager");
// Define program version and description
commander_1.program
    .version('1.0.0')
    .description('MCP SSH Client for server diagnostics and troubleshooting');
// Define commands
commander_1.program
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
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const config = yield promptForMissingConfig(options);
        const client = new ssh_client_1.SSHClient(config);
        console.log(chalk_1.default.blue('Connecting to server...'));
        yield client.connect();
        console.log(chalk_1.default.green('✓ Connected successfully'));
        const diagnosticRunner = new diagnostics_1.DiagnosticRunner(client);
        const troubleshooter = new troubleshooter_1.Troubleshooter(client);
        const reporter = new reporter_1.Reporter();
        // Execute basic system checks
        console.log(chalk_1.default.blue('\nRunning basic system diagnostics...'));
        const diagnosticResults = yield diagnosticRunner.runBasicSystemChecks();
        // Display the results
        console.log(reporter.formatDiagnosticResults(diagnosticResults));
        // Analyze results and suggest troubleshooting actions
        const actions = yield troubleshooter.analyzeDiagnostics(diagnosticResults);
        let selectedActionIndices = [];
        if (options.nonInteractive) {
            // In non-interactive mode, don't prompt for actions
            console.log(chalk_1.default.blue('\nRunning in non-interactive mode, skipping action selection.'));
        }
        else {
            // Ask which actions to execute
            const { selectedActions } = yield inquirer_1.default.prompt([
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
        const troubleshootingResults = {};
        for (const actionIndex of selectedActionIndices) {
            const action = actions[actionIndex];
            console.log(chalk_1.default.blue(`\nExecuting: ${action.name}`));
            const output = yield troubleshooter.executeAction(action);
            troubleshootingResults[action.name] = output;
            console.log(reporter.formatActionResult(action.name, output));
        }
        // Skip custom issue in non-interactive mode
        if (!options.nonInteractive) {
            // Ask for custom issue
            const { customIssue } = yield inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'customIssue',
                    message: 'Describe any specific issue you want to troubleshoot (or press enter to skip):',
                }
            ]);
            if (customIssue) {
                const customActions = yield troubleshooter.getCustomActionForIssue(customIssue);
                if (customActions.length > 0) {
                    const { selectedCustomActions } = yield inquirer_1.default.prompt([
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
                        console.log(chalk_1.default.blue(`\nExecuting: ${action.name}`));
                        const output = yield troubleshooter.executeAction(action);
                        troubleshootingResults[action.name] = output;
                        console.log(reporter.formatActionResult(action.name, output));
                    }
                }
                else {
                    console.log(chalk_1.default.yellow('No specific troubleshooting actions found for the described issue.'));
                }
            }
        }
        // Generate report if requested
        if (options.report) {
            const systemInfo = (yield client.executeCommand('uname -a && hostname && uptime')).stdout;
            const reportData = {
                timestamp: new Date().toISOString(),
                systemInfo,
                diagnostics: diagnosticResults,
                troubleshooting: troubleshootingResults
            };
            let reportPath;
            if (options.report === 'json') {
                reportPath = reporter.saveReportToFile(reportData);
                console.log(chalk_1.default.green(`\nJSON report saved to: ${reportPath}`));
            }
            else if (options.report === 'html') {
                reportPath = reporter.generateHtmlReport(reportData);
                console.log(chalk_1.default.green(`\nHTML report saved to: ${reportPath}`));
            }
        }
        // Skip interactive shell in non-interactive mode
        if (options.nonInteractive) {
            // Disconnect if in non-interactive mode
            client.disconnect();
            console.log(chalk_1.default.blue('\nDisconnected from server.'));
        }
        else {
            // Ask if user wants to open interactive shell
            const { openShell } = yield inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'openShell',
                    message: 'Would you like to open an interactive shell session?',
                    default: false
                }
            ]);
            if (openShell) {
                console.log(chalk_1.default.blue('\nOpening interactive shell. Type "exit" to close the connection.'));
                const shell = yield client.getInteractiveShell();
                // Connect the shell to stdin/stdout
                process.stdin.setRawMode(true);
                process.stdin.pipe(shell);
                shell.pipe(process.stdout);
                shell.on('close', () => {
                    process.stdin.setRawMode(false);
                    process.stdin.unpipe(shell);
                    shell.unpipe(process.stdout);
                    console.log(chalk_1.default.blue('\nShell session closed.'));
                    client.disconnect();
                    process.exit(0);
                });
            }
            else {
                // Disconnect if not using shell
                client.disconnect();
                console.log(chalk_1.default.blue('\nDisconnected from server.'));
            }
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk_1.default.red(`Error: ${errorMessage}`));
        process.exit(1);
    }
}));
commander_1.program
    .command('troubleshoot')
    .description('Directly troubleshoot a specific issue')
    .option('-h, --host <host>', 'Server hostname or IP address')
    .option('-p, --port <port>', 'SSH port (default: 22)')
    .option('-u, --username <username>', 'SSH username')
    .option('-k, --key <key_path>', 'Path to private key file')
    .option('-P, --password', 'Use password authentication')
    .option('-i, --issue <issue>', 'Issue description (e.g., "slow performance", "disk space")')
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!options.issue) {
            const { issue } = yield inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'issue',
                    message: 'Describe the issue you want to troubleshoot:',
                    validate: (input) => input ? true : 'Please describe the issue'
                }
            ]);
            options.issue = issue;
        }
        const config = yield promptForMissingConfig(options);
        const client = new ssh_client_1.SSHClient(config);
        console.log(chalk_1.default.blue('Connecting to server...'));
        yield client.connect();
        console.log(chalk_1.default.green('✓ Connected successfully'));
        const troubleshooter = new troubleshooter_1.Troubleshooter(client);
        const reporter = new reporter_1.Reporter();
        // Get actions for the specific issue
        const actions = yield troubleshooter.getCustomActionForIssue(options.issue);
        if (actions.length === 0) {
            console.log(chalk_1.default.yellow('No specific troubleshooting actions found for the described issue.'));
            console.log(chalk_1.default.blue('Running general diagnostics instead...'));
            const diagnosticRunner = new diagnostics_1.DiagnosticRunner(client);
            const diagnosticResults = yield diagnosticRunner.runBasicSystemChecks();
            console.log(reporter.formatDiagnosticResults(diagnosticResults));
        }
        else {
            // Execute all actions for this issue
            for (const action of actions) {
                console.log(chalk_1.default.blue(`\nExecuting: ${action.name}`));
                const output = yield troubleshooter.executeAction(action);
                console.log(reporter.formatActionResult(action.name, output));
            }
        }
        client.disconnect();
        console.log(chalk_1.default.blue('\nDisconnected from server.'));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk_1.default.red(`Error: ${errorMessage}`));
        process.exit(1);
    }
}));
commander_1.program
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
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const config = yield promptForMissingConfig(options);
        const client = new ssh_client_1.SSHClient(config);
        console.log(chalk_1.default.blue('Connecting to server...'));
        yield client.connect();
        console.log(chalk_1.default.green('✓ Connected successfully'));
        const diagnosticRunner = new diagnostics_1.DiagnosticRunner(client);
        // Check only for updates
        console.log(chalk_1.default.blue('\nChecking for pending updates...'));
        const updateResult = yield diagnosticRunner.checkPendingUpdates();
        // Format and display the results
        const statusColor = updateResult.status === 'success' ? chalk_1.default.green :
            updateResult.status === 'warning' ? chalk_1.default.yellow :
                chalk_1.default.red;
        console.log(statusColor(`[${updateResult.status.toUpperCase()}] ${updateResult.name}`));
        console.log('--------------------------------');
        console.log(updateResult.output);
        if (updateResult.details) {
            console.log(statusColor(`\nSummary: ${updateResult.details}`));
        }
        // Disconnect
        client.disconnect();
        console.log(chalk_1.default.blue('\nDisconnected from server.'));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk_1.default.red(`Error: ${errorMessage}`));
        process.exit(1);
    }
}));
commander_1.program
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
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!options.command) {
            const { command } = yield inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'command',
                    message: 'Enter the command to run:',
                    validate: (input) => input ? true : 'Please enter a command'
                }
            ]);
            options.command = command;
        }
        const config = yield promptForMissingConfig(options);
        const client = new ssh_client_1.SSHClient(config);
        console.log(chalk_1.default.blue('Connecting to server...'));
        yield client.connect();
        console.log(chalk_1.default.green('✓ Connected successfully'));
        console.log(chalk_1.default.blue(`\nExecuting: ${options.command}`));
        const { stdout, stderr, code } = yield client.executeCommand(options.command);
        console.log(chalk_1.default.yellow('Output:'));
        console.log(stdout || stderr);
        console.log(chalk_1.default.blue(`\nCommand exited with code: ${code}`));
        client.disconnect();
        console.log(chalk_1.default.blue('\nDisconnected from server.'));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk_1.default.red(`Error: ${errorMessage}`));
        process.exit(1);
    }
}));
// Function to prompt for missing configuration
function promptForMissingConfig(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const questions = [];
        if (!options.host) {
            questions.push({
                type: 'input',
                name: 'host',
                message: 'Server hostname or IP address:',
                validate: (input) => input ? true : 'Server hostname is required'
            });
        }
        if (!options.port) {
            questions.push({
                type: 'input',
                name: 'port',
                message: 'SSH port:',
                default: '22',
                validate: (input) => /^\d+$/.test(input) ? true : 'Port must be a number'
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
                host: options.host || (yield inquirer_1.default.prompt(questions.filter(q => q.name === 'host'))).host,
                port: parseInt(options.port || (questions.some(q => q.name === 'port') ?
                    (yield inquirer_1.default.prompt(questions.filter(q => q.name === 'port'))).port : '22'), 10),
                username: options.username || (questions.some(q => q.name === 'username') ?
                    (yield inquirer_1.default.prompt(questions.filter(q => q.name === 'username'))).username : os.userInfo().username),
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
            const authAnswer = yield inquirer_1.default.prompt([questions.pop()]);
            authMethod = authAnswer.authMethod;
        }
        else {
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
                    validate: (input) => input && fs.existsSync(input) ? true : 'Please provide a valid path to SSH config file'
                });
            }
        }
        else if (authMethod === 'key' && !options.key) {
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
                }
                catch (error) {
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
                const keyAnswer = yield inquirer_1.default.prompt([questions.pop()]);
                if (keyAnswer.key === 'custom') {
                    questions.push({
                        type: 'input',
                        name: 'key',
                        message: 'Path to private key:',
                        validate: (input) => input && fs.existsSync(input) ? true : 'Please provide a valid path to your private key'
                    });
                }
                else {
                    selectedKeyPath = keyAnswer.key;
                    questions.push({
                        type: 'confirm',
                        name: 'hasPassphrase',
                        message: 'Does this key have a passphrase?',
                        default: false
                    });
                    const { hasPassphrase } = yield inquirer_1.default.prompt([questions.pop()]);
                    if (hasPassphrase && !options.passphrase) {
                        questions.push({
                            type: 'password',
                            name: 'passphrase',
                            message: 'Key passphrase:',
                            validate: (input) => input ? true : 'Passphrase is required'
                        });
                    }
                }
            }
            else {
                // No key files found, ask for path
                questions.push({
                    type: 'input',
                    name: 'key',
                    message: 'Path to private key:',
                    validate: (input) => input && fs.existsSync(input) ? true : 'Please provide a valid path to your private key'
                });
            }
        }
        let passwordPrompt = null;
        if (authMethod === 'password') {
            passwordPrompt = {
                type: 'password',
                name: 'password',
                message: 'SSH password:',
                validate: (input) => input ? true : 'Password is required'
            };
        }
        const answers = yield inquirer_1.default.prompt(questions);
        // Handle password separately to keep it secure
        let password = '';
        if (passwordPrompt) {
            password = (yield inquirer_1.default.prompt([passwordPrompt])).password;
        }
        // Prepare the config object
        const config = {
            host: options.host || answers.host,
            port: parseInt(options.port || answers.port, 10),
            username: options.username || answers.username,
            useAgent: options.agent !== false && authMethod === 'agent'
        };
        // Set authentication details based on method
        if (authMethod === 'password' || options.password) {
            config.password = password || undefined;
        }
        else if (authMethod === 'key' || options.key) {
            config.privateKey = options.key || answers.key || selectedKeyPath;
            config.passphrase = options.passphrase || answers.passphrase;
        }
        else if (authMethod === 'config' || options.config) {
            config.configFile = options.config || answers.configPath;
        }
        return config;
    });
}
commander_1.program
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
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!options.hosts) {
            const { hosts } = yield inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'hosts',
                    message: 'Enter comma-separated list of server hostnames or IPs:',
                    validate: (input) => input ? true : 'At least one host is required'
                }
            ]);
            options.hosts = hosts;
        }
        const hostList = options.hosts.split(',').map((host) => host.trim());
        // Setup base configuration
        const baseConfig = {};
        if (options.port)
            baseConfig.port = parseInt(options.port, 10);
        if (options.username)
            baseConfig.username = options.username;
        if (options.key)
            baseConfig.privateKey = options.key;
        if (options.pwd)
            baseConfig.password = options.pwd;
        // Store diagnostic results for all servers
        const allResults = {};
        console.log(chalk_1.default.blue(`\nRunning diagnostics on ${hostList.length} servers...\n`));
        for (const host of hostList) {
            try {
                console.log(chalk_1.default.yellow(`--- Server: ${host} ---`));
                // Create config for this host
                const config = Object.assign(Object.assign({}, baseConfig), { host });
                // If no direct password was provided and password auth was selected,
                // prompt for the password for each server
                if (!config.password && !config.privateKey && options.password) {
                    const { serverPassword } = yield inquirer_1.default.prompt([
                        {
                            type: 'password',
                            name: 'serverPassword',
                            message: `SSH password for ${host}:`,
                            validate: (input) => input ? true : 'Password is required'
                        }
                    ]);
                    config.password = serverPassword;
                }
                // Connect
                console.log(chalk_1.default.blue('Connecting to server...'));
                const client = new ssh_client_1.SSHClient(config);
                yield client.connect();
                console.log(chalk_1.default.green('✓ Connected successfully'));
                // Run diagnostics
                console.log(chalk_1.default.blue('\nRunning basic system diagnostics...'));
                const diagnosticRunner = new diagnostics_1.DiagnosticRunner(client);
                const diagnosticResults = yield diagnosticRunner.runBasicSystemChecks();
                // Display the results
                const reporter = new reporter_1.Reporter();
                console.log(reporter.formatDiagnosticResults(diagnosticResults));
                // Store results for this host
                allResults[host] = diagnosticResults;
                // Generate report if requested
                if (options.report) {
                    const systemInfo = (yield client.executeCommand('uname -a && hostname && uptime')).stdout;
                    const reportData = {
                        timestamp: new Date().toISOString(),
                        host,
                        systemInfo,
                        diagnostics: diagnosticResults
                    };
                    let reportPath;
                    if (options.report === 'json') {
                        reportPath = reporter.saveReportToFile(reportData, `diagnostic-report-${host}-${Date.now()}.json`);
                        console.log(chalk_1.default.green(`\nJSON report saved to: ${reportPath}`));
                    }
                    else if (options.report === 'html') {
                        reportPath = reporter.generateHtmlReport(reportData, `diagnostic-report-${host}-${Date.now()}.html`);
                        console.log(chalk_1.default.green(`\nHTML report saved to: ${reportPath}`));
                    }
                }
                // Disconnect
                client.disconnect();
                console.log(chalk_1.default.blue('\nDisconnected from server.'));
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(chalk_1.default.red(`Error on ${host}: ${errorMessage}`));
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
        console.log(chalk_1.default.blue('\n=== SUMMARY ==='));
        for (const host of hostList) {
            if (allResults[host]) {
                const results = allResults[host];
                const hasErrors = results.some(r => r.status === 'error');
                const hasWarnings = results.some(r => r.status === 'warning');
                if (hasErrors) {
                    console.log(chalk_1.default.red(`✗ ${host}: Errors detected`));
                }
                else if (hasWarnings) {
                    console.log(chalk_1.default.yellow(`⚠ ${host}: Warnings detected`));
                }
                else {
                    console.log(chalk_1.default.green(`✓ ${host}: All systems healthy`));
                }
            }
            else {
                console.log(chalk_1.default.red(`✗ ${host}: Failed to connect`));
            }
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk_1.default.red(`Error: ${errorMessage}`));
        process.exit(1);
    }
}));
commander_1.program
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
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!options.hosts) {
            const { hosts } = yield inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'hosts',
                    message: 'Enter comma-separated list of server hostnames or IPs:',
                    validate: (input) => input ? true : 'At least one host is required'
                }
            ]);
            options.hosts = hosts;
        }
        if (!options.command) {
            const { command } = yield inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'command',
                    message: 'Enter the command to run on all servers:',
                    validate: (input) => input ? true : 'Command is required'
                }
            ]);
            options.command = command;
        }
        const hostList = options.hosts.split(',').map((host) => host.trim());
        // Setup base configuration
        const baseConfig = {};
        if (options.port)
            baseConfig.port = parseInt(options.port, 10);
        if (options.username)
            baseConfig.username = options.username;
        if (options.key)
            baseConfig.privateKey = options.key;
        if (options.pwd)
            baseConfig.password = options.pwd;
        // Handle results for multiple servers
        const results = [];
        console.log(chalk_1.default.blue(`\nExecuting command on ${hostList.length} servers...\n`));
        for (const host of hostList) {
            try {
                console.log(chalk_1.default.yellow(`--- Server: ${host} ---`));
                // Create config for this host
                const config = Object.assign(Object.assign({}, baseConfig), { host });
                // If no direct password was provided and password auth was selected,
                // prompt for the password for each server
                if (!config.password && !config.privateKey && options.password) {
                    const { serverPassword } = yield inquirer_1.default.prompt([
                        {
                            type: 'password',
                            name: 'serverPassword',
                            message: `SSH password for ${host}:`,
                            validate: (input) => input ? true : 'Password is required'
                        }
                    ]);
                    config.password = serverPassword;
                }
                // Connect
                console.log(chalk_1.default.blue('Connecting to server...'));
                const client = new ssh_client_1.SSHClient(config);
                yield client.connect();
                console.log(chalk_1.default.green('✓ Connected successfully'));
                // Execute command
                console.log(chalk_1.default.blue(`\nExecuting: ${options.command}`));
                const { stdout, stderr, code } = yield client.executeCommand(options.command);
                console.log(chalk_1.default.yellow('Output:'));
                console.log(stdout || stderr);
                console.log(chalk_1.default.blue(`\nCommand exited with code: ${code}`));
                // Store result
                results.push({
                    host,
                    success: true,
                    output: stdout || stderr,
                    code
                });
                // Disconnect
                client.disconnect();
                console.log(chalk_1.default.blue('\nDisconnected from server.'));
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(chalk_1.default.red(`Error on ${host}: ${errorMessage}`));
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
        console.log(chalk_1.default.blue('\n=== SUMMARY ==='));
        for (const result of results) {
            if (result.success) {
                console.log(chalk_1.default.green(`✓ ${result.host}: Command completed with exit code ${result.code}`));
            }
            else {
                console.log(chalk_1.default.red(`✗ ${result.host}: Failed - ${result.error}`));
            }
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk_1.default.red(`Error: ${errorMessage}`));
        process.exit(1);
    }
}));
// Hyper-V VM management commands
commander_1.program
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
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const config = yield promptForMissingConfig(options);
        const client = new ssh_client_1.SSHClient(config);
        console.log(chalk_1.default.blue('Connecting to Windows Hyper-V host...'));
        yield client.connect();
        console.log(chalk_1.default.green('✓ Connected successfully'));
        const hyperv = new hyperv_manager_1.HyperVManager(client);
        // Handle different command options
        if (options.list) {
            // List all VMs
            console.log(chalk_1.default.blue('\nRetrieving list of virtual machines...'));
            const vms = yield hyperv.listVMs();
            if (vms.length === 0) {
                console.log(chalk_1.default.yellow('No virtual machines found.'));
            }
            else {
                console.log(chalk_1.default.bold('\nVirtual Machines:'));
                vms.forEach(vm => {
                    const stateColor = vm.state === 'Running' ? chalk_1.default.green :
                        (vm.state === 'Off' ? chalk_1.default.red : chalk_1.default.yellow);
                    console.log(`${chalk_1.default.bold(vm.name)} - State: ${stateColor(vm.state)}`);
                    if (vm.memoryAssigned)
                        console.log(`  Memory: ${vm.memoryAssigned}`);
                    if (vm.cpuUsage)
                        console.log(`  CPU Usage: ${vm.cpuUsage}%`);
                    if (vm.uptime)
                        console.log(`  Uptime: ${vm.uptime}`);
                    console.log();
                });
            }
        }
        else if (options.info) {
            // Get VM details
            console.log(chalk_1.default.blue(`\nRetrieving details for VM: ${options.info}...`));
            const vmInfo = yield hyperv.getVMDetails(options.info);
            console.log(chalk_1.default.bold(`\nVM: ${vmInfo.name}`));
            console.log(`State: ${vmInfo.state === 'Running' ? chalk_1.default.green(vmInfo.state) :
                (vmInfo.state === 'Off' ? chalk_1.default.red(vmInfo.state) : chalk_1.default.yellow(vmInfo.state))}`);
            console.log(`Generation: ${vmInfo.generation}`);
            console.log(`Memory: ${vmInfo.memoryAssigned}`);
            console.log(`Dynamic Memory: ${vmInfo.dynamicMemoryEnabled ? 'Enabled' : 'Disabled'}`);
            if (vmInfo.cpuUsage)
                console.log(`CPU Usage: ${vmInfo.cpuUsage}%`);
            if (vmInfo.uptime)
                console.log(`Uptime: ${vmInfo.uptime}`);
            if (vmInfo.networkAdapters && vmInfo.networkAdapters.length > 0) {
                console.log(chalk_1.default.bold('\nNetwork Adapters:'));
                vmInfo.networkAdapters.forEach((adapter, i) => {
                    console.log(`  ${i + 1}: ${adapter}`);
                });
            }
            if (vmInfo.hardDrives && vmInfo.hardDrives.length > 0) {
                console.log(chalk_1.default.bold('\nHard Drives:'));
                vmInfo.hardDrives.forEach((drive, i) => {
                    console.log(`  ${i + 1}: ${drive}`);
                });
            }
        }
        else if (options.start) {
            // Start VM
            console.log(chalk_1.default.blue(`\nStarting VM: ${options.start}...`));
            yield hyperv.startVM(options.start);
            console.log(chalk_1.default.green(`✓ VM ${options.start} started successfully`));
        }
        else if (options.stop) {
            // Stop VM
            console.log(chalk_1.default.blue(`\nStopping VM: ${options.stop}${options.force ? ' (forced)' : ''}...`));
            yield hyperv.stopVM(options.stop, options.force);
            console.log(chalk_1.default.green(`✓ VM ${options.stop} stopped successfully`));
        }
        else if (options.delete) {
            // Delete VM
            console.log(chalk_1.default.blue(`\nDeleting VM: ${options.delete}${options.removeDisks ? ' (including disks)' : ''}...`));
            // Ask for confirmation
            if (!options.nonInteractive) {
                const { confirmDelete } = yield inquirer_1.default.prompt([{
                        type: 'confirm',
                        name: 'confirmDelete',
                        message: `Are you sure you want to delete the VM '${options.delete}'? This cannot be undone.`,
                        default: false
                    }]);
                if (!confirmDelete) {
                    console.log(chalk_1.default.yellow('Delete operation cancelled.'));
                    client.disconnect();
                    return;
                }
            }
            yield hyperv.deleteVM(options.delete, options.removeDisks);
            console.log(chalk_1.default.green(`✓ VM ${options.delete} deleted successfully`));
        }
        else if (options.hostInfo) {
            // Get host information
            console.log(chalk_1.default.blue('\nRetrieving Hyper-V host information...'));
            const hostInfo = yield hyperv.getHostInfo();
            console.log(chalk_1.default.bold('\nHyper-V Host Information:'));
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
        }
        else if (options.switches) {
            // List virtual switches
            console.log(chalk_1.default.blue('\nRetrieving virtual switches...'));
            const switches = yield hyperv.listSwitches();
            if (switches.length === 0) {
                console.log(chalk_1.default.yellow('No virtual switches found.'));
            }
            else {
                console.log(chalk_1.default.bold('\nVirtual Switches:'));
                switches.forEach(sw => {
                    console.log(`${chalk_1.default.bold(sw.Name)} - Type: ${sw.SwitchType}`);
                    if (sw.NetAdapterInterfaceDescription) {
                        console.log(`  Connected to: ${sw.NetAdapterInterfaceDescription}`);
                    }
                    console.log();
                });
            }
        }
        else if (options.attachIso) {
            // Check if iso path is provided
            if (!options.isoPath) {
                console.log(chalk_1.default.red('Error: --iso-path is required when using --attach-iso'));
                client.disconnect();
                process.exit(1);
            }
            console.log(chalk_1.default.blue(`\nAttaching ISO file to VM: ${options.attachIso}...`));
            console.log(`ISO Path: ${options.isoPath}`);
            yield hyperv.attachISO(options.attachIso, options.isoPath);
            console.log(chalk_1.default.green(`✓ ISO attached successfully to VM ${options.attachIso}`));
            // Ask if the user wants to start the VM
            if (!options.nonInteractive) {
                const { startVM } = yield inquirer_1.default.prompt([{
                        type: 'confirm',
                        name: 'startVM',
                        message: `Would you like to start VM '${options.attachIso}' now?`,
                        default: true
                    }]);
                if (startVM) {
                    console.log(chalk_1.default.blue(`\nStarting VM: ${options.attachIso}...`));
                    yield hyperv.startVM(options.attachIso);
                    console.log(chalk_1.default.green(`✓ VM ${options.attachIso} started successfully`));
                }
            }
        }
        else {
            console.log(chalk_1.default.yellow('No action specified. Use --list, --info, --start, --stop, --delete, --host-info, --switches, or --attach-iso'));
        }
        // Disconnect
        client.disconnect();
        console.log(chalk_1.default.blue('\nDisconnected from Hyper-V host.'));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk_1.default.red(`Error: ${errorMessage}`));
        process.exit(1);
    }
}));
// Create VM command (separated for clarity)
commander_1.program
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
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Check for required parameters
        if (!options.nonInteractive && (!options.name || !options.memory || !options.cpu || !options.disk)) {
            const questions = [];
            if (!options.name) {
                questions.push({
                    type: 'input',
                    name: 'name',
                    message: 'Enter a name for the new VM:',
                    validate: (input) => input ? true : 'VM name is required'
                });
            }
            if (!options.memory) {
                questions.push({
                    type: 'number',
                    name: 'memory',
                    message: 'Enter memory in GB for the VM:',
                    default: 2,
                    validate: (input) => input > 0 ? true : 'Memory must be greater than 0'
                });
            }
            if (!options.cpu) {
                questions.push({
                    type: 'number',
                    name: 'cpu',
                    message: 'Enter number of CPU cores for the VM:',
                    default: 2,
                    validate: (input) => input > 0 ? true : 'CPU count must be greater than 0'
                });
            }
            if (!options.disk) {
                questions.push({
                    type: 'number',
                    name: 'disk',
                    message: 'Enter disk size in GB for the VM:',
                    default: 60,
                    validate: (input) => input > 0 ? true : 'Disk size must be greater than 0'
                });
            }
            const answers = yield inquirer_1.default.prompt(questions);
            options = Object.assign(Object.assign({}, options), answers);
        }
        const config = yield promptForMissingConfig(options);
        const client = new ssh_client_1.SSHClient(config);
        console.log(chalk_1.default.blue('Connecting to Windows Hyper-V host...'));
        yield client.connect();
        console.log(chalk_1.default.green('✓ Connected successfully'));
        const hyperv = new hyperv_manager_1.HyperVManager(client);
        // Get virtual switches if not specified
        if (!options.switch && !options.nonInteractive) {
            const switches = yield hyperv.listSwitches();
            if (switches.length > 0) {
                const { selectedSwitch } = yield inquirer_1.default.prompt([{
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
        console.log(chalk_1.default.blue(`\nCreating new VM: ${options.name}...`));
        console.log(`Memory: ${options.memory} GB, CPUs: ${options.cpu}, Disk: ${options.disk} GB`);
        if (options.switch)
            console.log(`Network: ${options.switch}`);
        if (options.iso)
            console.log(`Installation ISO: ${options.iso}`);
        const vmOptions = {
            name: options.name,
            memoryInGB: parseFloat(options.memory),
            cpuCount: parseInt(options.cpu, 10),
            diskSizeInGB: parseFloat(options.disk),
            switchName: options.switch,
            generation: options.generation ? parseInt(options.generation, 10) : 2,
            isoPath: options.iso,
            vhdPath: options.vhd
        };
        const newVM = yield hyperv.createVM(vmOptions);
        console.log(chalk_1.default.green(`\n✓ VM ${options.name} created successfully!`));
        console.log(chalk_1.default.bold('\nVM Details:'));
        console.log(`Name: ${newVM.name}`);
        console.log(`State: ${newVM.state}`);
        console.log(`Generation: ${newVM.generation}`);
        console.log(`Memory: ${newVM.memoryAssigned}`);
        if (newVM.networkAdapters && newVM.networkAdapters.length > 0) {
            console.log(chalk_1.default.bold('\nNetwork Adapters:'));
            newVM.networkAdapters.forEach((adapter, i) => {
                console.log(`  ${i + 1}: ${adapter}`);
            });
        }
        if (newVM.hardDrives && newVM.hardDrives.length > 0) {
            console.log(chalk_1.default.bold('\nHard Drives:'));
            newVM.hardDrives.forEach((drive, i) => {
                console.log(`  ${i + 1}: ${drive}`);
            });
        }
        console.log(chalk_1.default.bold('\nNext Steps:'));
        if (options.iso) {
            console.log('- The VM is ready with installation media attached.');
            console.log('- Start the VM to begin OS installation:');
            console.log(`  ${chalk_1.default.cyan(`mcp-ssh-client hyperv --host ${options.host} --start ${options.name}`)}`);
        }
        else {
            console.log('- The VM has been created with a blank disk.');
            console.log('- You need to attach installation media before starting it:');
            console.log(`  ${chalk_1.default.cyan(`mcp-ssh-client hyperv --host ${options.host} --attach-iso ${options.name} --iso-path "C:\\path\\to\\your.iso"`)}`);
        }
        // Disconnect
        client.disconnect();
        console.log(chalk_1.default.blue('\nDisconnected from Hyper-V host.'));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk_1.default.red(`Error: ${errorMessage}`));
        process.exit(1);
    }
}));
// Note: The autoinstall feature was removed as it doesn't work properly with Type 2 hypervisor deployments
// Parse arguments and execute
commander_1.program.parse(process.argv);
// Show help if no arguments
if (process.argv.length <= 2) {
    commander_1.program.help();
}
