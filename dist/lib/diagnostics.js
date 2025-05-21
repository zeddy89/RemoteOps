"use strict";
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
exports.DiagnosticRunner = void 0;
class DiagnosticRunner {
    constructor(client) {
        this.client = client;
    }
    runBasicSystemChecks() {
        return __awaiter(this, void 0, void 0, function* () {
            const checks = [
                this.checkSystemInfo(),
                this.checkDiskSpace(),
                this.checkMemoryUsage(),
                this.checkCPULoad(),
                this.checkNetworkStatus(),
                this.checkProcessList(),
                this.checkPendingUpdates(),
            ];
            return Promise.all(checks);
        });
    }
    checkPendingUpdates() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // First, try to detect the package manager
                const { stdout: osInfo } = yield this.client.executeCommand('cat /etc/os-release');
                let command = '';
                let parseOutput = (output) => {
                    return { status: 'success', details: 'No updates available' };
                };
                if (osInfo.includes('ID=debian') || osInfo.includes('ID=ubuntu')) {
                    // Debian/Ubuntu
                    command = 'apt-get update -qq && apt-get --simulate upgrade';
                    parseOutput = (output) => {
                        if (output.includes('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded')) {
                            return { status: 'success', details: 'No updates available' };
                        }
                        else {
                            const upgradable = output.match(/(\d+) upgraded, (\d+) newly installed/);
                            if (upgradable && upgradable[1] !== '0') {
                                return {
                                    status: 'warning',
                                    details: `${upgradable[1]} packages can be upgraded`
                                };
                            }
                            return { status: 'success', details: 'System up to date' };
                        }
                    };
                }
                else if (osInfo.includes('ID="centos"') || osInfo.includes('ID="rhel"') ||
                    osInfo.includes('ID="fedora"') || osInfo.includes('ID="rocky"')) {
                    // RHEL/CentOS/Fedora/Rocky
                    command = 'dnf check-update -q';
                    parseOutput = (output) => {
                        if (output.trim() === '') {
                            return { status: 'success', details: 'No updates available' };
                        }
                        else {
                            const lines = output.trim().split('\\n').filter(line => line.trim() !== '');
                            return {
                                status: 'warning',
                                details: `${lines.length} packages can be upgraded`
                            };
                        }
                    };
                }
                else if (osInfo.includes('ID=arch') || osInfo.includes('ID=manjaro')) {
                    // Arch/Manjaro
                    command = 'pacman -Qu';
                    parseOutput = (output) => {
                        if (output.trim() === '') {
                            return { status: 'success', details: 'No updates available' };
                        }
                        else {
                            const lines = output.trim().split('\\n').filter(line => line.trim() !== '');
                            return {
                                status: 'warning',
                                details: `${lines.length} packages can be upgraded`
                            };
                        }
                    };
                }
                else {
                    // Try to detect by checking which commands are available
                    const { stdout: whichApt } = yield this.client.executeCommand('which apt 2>/dev/null || echo "not found"');
                    const { stdout: whichDnf } = yield this.client.executeCommand('which dnf 2>/dev/null || echo "not found"');
                    const { stdout: whichYum } = yield this.client.executeCommand('which yum 2>/dev/null || echo "not found"');
                    const { stdout: whichPacman } = yield this.client.executeCommand('which pacman 2>/dev/null || echo "not found"');
                    if (whichApt !== 'not found') {
                        command = 'apt-get update -qq && apt-get --simulate upgrade';
                        parseOutput = (output) => {
                            if (output.includes('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded')) {
                                return { status: 'success', details: 'No updates available' };
                            }
                            else {
                                const upgradable = output.match(/(\d+) upgraded, (\d+) newly installed/);
                                if (upgradable && upgradable[1] !== '0') {
                                    return {
                                        status: 'warning',
                                        details: `${upgradable[1]} packages can be upgraded`
                                    };
                                }
                                return { status: 'success', details: 'System up to date' };
                            }
                        };
                    }
                    else if (whichDnf !== 'not found') {
                        command = 'dnf check-update -q';
                        parseOutput = (output) => {
                            if (output.trim() === '') {
                                return { status: 'success', details: 'No updates available' };
                            }
                            else {
                                const lines = output.trim().split('\\n').filter(line => line.trim() !== '');
                                return {
                                    status: 'warning',
                                    details: `${lines.length} packages can be upgraded`
                                };
                            }
                        };
                    }
                    else if (whichYum !== 'not found') {
                        command = 'yum check-update -q';
                        parseOutput = (output) => {
                            if (output.trim() === '') {
                                return { status: 'success', details: 'No updates available' };
                            }
                            else {
                                const lines = output.trim().split('\\n').filter(line => line.trim() !== '');
                                return {
                                    status: 'warning',
                                    details: `${lines.length} packages can be upgraded`
                                };
                            }
                        };
                    }
                    else if (whichPacman !== 'not found') {
                        command = 'pacman -Qu';
                        parseOutput = (output) => {
                            if (output.trim() === '') {
                                return { status: 'success', details: 'No updates available' };
                            }
                            else {
                                const lines = output.trim().split('\\n').filter(line => line.trim() !== '');
                                return {
                                    status: 'warning',
                                    details: `${lines.length} packages can be upgraded`
                                };
                            }
                        };
                    }
                    else {
                        return {
                            name: 'Pending Updates',
                            status: 'error',
                            output: 'Could not determine the package manager for this system'
                        };
                    }
                }
                const { stdout, stderr, code } = yield this.client.executeCommand(command);
                const result = parseOutput(stdout);
                return {
                    name: 'Pending Updates',
                    status: result.status,
                    output: stdout || stderr,
                    details: result.details
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    name: 'Pending Updates',
                    status: 'error',
                    output: `Failed to check for updates: ${errorMessage}`
                };
            }
        });
    }
    checkSystemInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { stdout, stderr, code } = yield this.client.executeCommand('uname -a && hostname && uptime');
                return {
                    name: 'System Information',
                    status: code === 0 ? 'success' : 'error',
                    output: stdout || stderr,
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    name: 'System Information',
                    status: 'error',
                    output: `Failed to get system information: ${errorMessage}`,
                };
            }
        });
    }
    checkDiskSpace() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { stdout, stderr, code } = yield this.client.executeCommand('df -h');
                const result = {
                    name: 'Disk Space',
                    status: code === 0 ? 'success' : 'error',
                    output: stdout || stderr,
                };
                // Check for any filesystem using more than 90% capacity
                if (stdout && ((_a = stdout.match(/\d+%/g)) === null || _a === void 0 ? void 0 : _a.some(usage => parseInt(usage, 10) >= 90))) {
                    result.status = 'warning';
                }
                return result;
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    name: 'Disk Space',
                    status: 'error',
                    output: `Failed to check disk space: ${errorMessage}`,
                };
            }
        });
    }
    checkMemoryUsage() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { stdout, stderr, code } = yield this.client.executeCommand('free -h');
                const result = {
                    name: 'Memory Usage',
                    status: code === 0 ? 'success' : 'error',
                    output: stdout || stderr,
                };
                return result;
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    name: 'Memory Usage',
                    status: 'error',
                    output: `Failed to check memory usage: ${errorMessage}`,
                };
            }
        });
    }
    checkCPULoad() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { stdout, stderr, code } = yield this.client.executeCommand('top -bn1 | grep "Cpu(s)" && uptime');
                return {
                    name: 'CPU Load',
                    status: code === 0 ? 'success' : 'error',
                    output: stdout || stderr,
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    name: 'CPU Load',
                    status: 'error',
                    output: `Failed to check CPU load: ${errorMessage}`,
                };
            }
        });
    }
    checkNetworkStatus() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { stdout, stderr, code } = yield this.client.executeCommand('ip addr && netstat -tuln');
                return {
                    name: 'Network Status',
                    status: code === 0 ? 'success' : 'error',
                    output: stdout || stderr,
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    name: 'Network Status',
                    status: 'error',
                    output: `Failed to check network status: ${errorMessage}`,
                };
            }
        });
    }
    checkProcessList() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { stdout, stderr, code } = yield this.client.executeCommand('ps aux --sort=-%cpu | head -10');
                return {
                    name: 'Top Processes',
                    status: code === 0 ? 'success' : 'error',
                    output: stdout || stderr,
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    name: 'Top Processes',
                    status: 'error',
                    output: `Failed to get process list: ${errorMessage}`,
                };
            }
        });
    }
    runCustomCommand(command, name) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { stdout, stderr, code } = yield this.client.executeCommand(command);
                return {
                    name,
                    status: code === 0 ? 'success' : 'error',
                    output: stdout || stderr,
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    name,
                    status: 'error',
                    output: `Failed to execute command: ${errorMessage}`,
                };
            }
        });
    }
}
exports.DiagnosticRunner = DiagnosticRunner;
