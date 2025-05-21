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
            ];
            return Promise.all(checks);
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
                return {
                    name: 'System Information',
                    status: 'error',
                    output: `Failed to get system information: ${error.message}`,
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
                return {
                    name: 'Disk Space',
                    status: 'error',
                    output: `Failed to check disk space: ${error.message}`,
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
                return {
                    name: 'Memory Usage',
                    status: 'error',
                    output: `Failed to check memory usage: ${error.message}`,
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
                return {
                    name: 'CPU Load',
                    status: 'error',
                    output: `Failed to check CPU load: ${error.message}`,
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
                return {
                    name: 'Network Status',
                    status: 'error',
                    output: `Failed to check network status: ${error.message}`,
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
                return {
                    name: 'Top Processes',
                    status: 'error',
                    output: `Failed to get process list: ${error.message}`,
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
                return {
                    name,
                    status: 'error',
                    output: `Failed to execute command: ${error.message}`,
                };
            }
        });
    }
}
exports.DiagnosticRunner = DiagnosticRunner;
