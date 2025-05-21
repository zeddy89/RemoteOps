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
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const inquirer = __importStar(require("inquirer"));
const chalk = __importStar(require("chalk"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const ssh_client_1 = require("./lib/ssh-client");
const diagnostics_1 = require("./lib/diagnostics");
const troubleshooter_1 = require("./lib/troubleshooter");
const reporter_1 = require("./lib/reporter");
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
    .option('-r, --report <format>', 'Generate report in specified format (json, html)')
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const config = yield promptForMissingConfig(options);
        const client = new ssh_client_1.SSHClient(config);
        console.log(chalk.blue('Connecting to server...'));
        yield client.connect();
        console.log(chalk.green('✓ Connected successfully'));
        const diagnosticRunner = new diagnostics_1.DiagnosticRunner(client);
        const troubleshooter = new troubleshooter_1.Troubleshooter(client);
        const reporter = new reporter_1.Reporter();
        // Execute basic system checks
        console.log(chalk.blue('\nRunning basic system diagnostics...'));
        const diagnosticResults = yield diagnosticRunner.runBasicSystemChecks();
        // Display the results
        console.log(reporter.formatDiagnosticResults(diagnosticResults));
        // Analyze results and suggest troubleshooting actions
        const actions = yield troubleshooter.analyzeDiagnostics(diagnosticResults);
        // Ask which actions to execute
        const { selectedActions } = yield inquirer.prompt([
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
        // Execute selected actions
        const troubleshootingResults = {};
        for (const actionIndex of selectedActions) {
            const action = actions[actionIndex];
            console.log(chalk.blue(`\nExecuting: ${action.name}`));
            const output = yield troubleshooter.executeAction(action);
            troubleshootingResults[action.name] = output;
            console.log(reporter.formatActionResult(action.name, output));
        }
        // Ask for custom issue
        const { customIssue } = yield inquirer.prompt([
            {
                type: 'input',
                name: 'customIssue',
                message: 'Describe any specific issue you want to troubleshoot (or press enter to skip):',
            }
        ]);
        if (customIssue) {
            const customActions = yield troubleshooter.getCustomActionForIssue(customIssue);
            if (customActions.length > 0) {
                const { selectedCustomActions } = yield inquirer.prompt([
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
                    const output = yield troubleshooter.executeAction(action);
                    troubleshootingResults[action.name] = output;
                    console.log(reporter.formatActionResult(action.name, output));
                }
            }
            else {
                console.log(chalk.yellow('No specific troubleshooting actions found for the described issue.'));
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
                console.log(chalk.green(`\nJSON report saved to: ${reportPath}`));
            }
            else if (options.report === 'html') {
                reportPath = reporter.generateHtmlReport(reportData);
                console.log(chalk.green(`\nHTML report saved to: ${reportPath}`));
            }
        }
        // Ask if user wants to open interactive shell
        const { openShell } = yield inquirer.prompt([
            {
                type: 'confirm',
                name: 'openShell',
                message: 'Would you like to open an interactive shell session?',
                default: false
            }
        ]);
        if (openShell) {
            console.log(chalk.blue('\nOpening interactive shell. Type "exit" to close the connection.'));
            const shell = yield client.getInteractiveShell();
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
        }
        else {
            // Disconnect if not using shell
            client.disconnect();
            console.log(chalk.blue('\nDisconnected from server.'));
        }
    }
    catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
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
            const { issue } = yield inquirer.prompt([
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
        console.log(chalk.blue('Connecting to server...'));
        yield client.connect();
        console.log(chalk.green('✓ Connected successfully'));
        const troubleshooter = new troubleshooter_1.Troubleshooter(client);
        const reporter = new reporter_1.Reporter();
        // Get actions for the specific issue
        const actions = yield troubleshooter.getCustomActionForIssue(options.issue);
        if (actions.length === 0) {
            console.log(chalk.yellow('No specific troubleshooting actions found for the described issue.'));
            console.log(chalk.blue('Running general diagnostics instead...'));
            const diagnosticRunner = new diagnostics_1.DiagnosticRunner(client);
            const diagnosticResults = yield diagnosticRunner.runBasicSystemChecks();
            console.log(reporter.formatDiagnosticResults(diagnosticResults));
        }
        else {
            // Execute all actions for this issue
            for (const action of actions) {
                console.log(chalk.blue(`\nExecuting: ${action.name}`));
                const output = yield troubleshooter.executeAction(action);
                console.log(reporter.formatActionResult(action.name, output));
            }
        }
        client.disconnect();
        console.log(chalk.blue('\nDisconnected from server.'));
    }
    catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
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
    .option('-c, --command <command>', 'Command to execute')
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!options.command) {
            const { command } = yield inquirer.prompt([
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
        console.log(chalk.blue('Connecting to server...'));
        yield client.connect();
        console.log(chalk.green('✓ Connected successfully'));
        console.log(chalk.blue(`\nExecuting: ${options.command}`));
        const { stdout, stderr, code } = yield client.executeCommand(options.command);
        console.log(chalk.yellow('Output:'));
        console.log(stdout || stderr);
        console.log(chalk.blue(`\nCommand exited with code: ${code}`));
        client.disconnect();
        console.log(chalk.blue('\nDisconnected from server.'));
    }
    catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
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
        let authMethod = '';
        if (!options.key && !options.password) {
            const defaultKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa');
            const hasDefaultKey = fs.existsSync(defaultKeyPath);
            questions.push({
                type: 'list',
                name: 'authMethod',
                message: 'Authentication method:',
                choices: [
                    {
                        name: `Private key${hasDefaultKey ? ` (default: ${defaultKeyPath})` : ''}`,
                        value: 'key'
                    },
                    { name: 'Password', value: 'password' }
                ],
                default: hasDefaultKey ? 'key' : 'password'
            });
            authMethod = (yield inquirer.prompt([questions.pop()])).authMethod;
        }
        else {
            authMethod = options.key ? 'key' : 'password';
        }
        if (authMethod === 'key' && !options.key) {
            const defaultKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa');
            questions.push({
                type: 'input',
                name: 'key',
                message: 'Path to private key:',
                default: fs.existsSync(defaultKeyPath) ? defaultKeyPath : '',
                validate: (input) => input && fs.existsSync(input) ? true : 'Please provide a valid path to your private key'
            });
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
        const answers = yield inquirer.prompt(questions);
        // Handle password separately to keep it secure
        let password = '';
        if (passwordPrompt) {
            password = (yield inquirer.prompt([passwordPrompt])).password;
        }
        return {
            host: options.host || answers.host,
            port: parseInt(options.port || answers.port, 10),
            username: options.username || answers.username,
            privateKey: options.key || answers.key,
            password: password || undefined
        };
    });
}
// Parse arguments and execute
commander_1.program.parse(process.argv);
// Show help if no arguments
if (process.argv.length <= 2) {
    commander_1.program.help();
}
