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
exports.SSHClient = void 0;
const ssh2_1 = require("ssh2");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
class SSHClient {
    constructor(config) {
        this.isConnected = false;
        this.client = new ssh2_1.Client();
        this.config = Object.assign(Object.assign({}, config), { port: config.port || 22, username: config.username || os.userInfo().username });
        // If privateKey is a file path string, read the file
        if (typeof this.config.privateKey === 'string' && fs.existsSync(this.config.privateKey)) {
            this.config.privateKey = fs.readFileSync(this.config.privateKey);
        }
        else if (!this.config.privateKey && !this.config.password) {
            // Try to use default SSH key if no authentication method provided
            const defaultKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa');
            if (fs.existsSync(defaultKeyPath)) {
                this.config.privateKey = fs.readFileSync(defaultKeyPath);
            }
        }
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isConnected) {
                return;
            }
            return new Promise((resolve, reject) => {
                this.client
                    .on('ready', () => {
                    this.isConnected = true;
                    resolve();
                })
                    .on('error', (err) => {
                    reject(new Error(`SSH connection error: ${err.message}`));
                })
                    .connect(this.config);
            });
        });
    }
    executeCommand(command) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isConnected) {
                yield this.connect();
            }
            return new Promise((resolve, reject) => {
                this.client.exec(command, (err, channel) => {
                    if (err) {
                        return reject(new Error(`Failed to execute command: ${err.message}`));
                    }
                    let stdout = '';
                    let stderr = '';
                    let exitCode = 0;
                    channel
                        .on('data', (data) => {
                        stdout += data.toString();
                    })
                        .on('stderr', (data) => {
                        stderr += data.toString();
                    })
                        .on('exit', (code) => {
                        exitCode = code;
                    })
                        .on('close', () => {
                        resolve({ stdout, stderr, code: exitCode });
                    })
                        .on('error', (err) => {
                        reject(new Error(`Channel error: ${err.message}`));
                    });
                });
            });
        });
    }
    getInteractiveShell() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isConnected) {
                yield this.connect();
            }
            return new Promise((resolve, reject) => {
                this.client.shell((err, stream) => {
                    if (err) {
                        return reject(new Error(`Failed to open shell: ${err.message}`));
                    }
                    resolve(stream);
                });
            });
        });
    }
    disconnect() {
        if (this.isConnected) {
            this.client.end();
            this.isConnected = false;
        }
    }
}
exports.SSHClient = SSHClient;
