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
exports.HyperVManager = void 0;
// Note: UbuntuAutoinstallOptions was removed as the feature is not compatible with Type 2 hypervisor deployments
class HyperVManager {
    constructor(client) {
        this.client = client;
    }
    /**
     * Execute a PowerShell command on the Windows host via SSH
     */
    executePowerShell(command) {
        return __awaiter(this, void 0, void 0, function* () {
            const psCommand = `powershell -Command "${command.replace(/"/g, '\\"')}"`;
            const result = yield this.client.executeCommand(psCommand);
            if (result.code !== 0) {
                throw new Error(`PowerShell command failed: ${result.stderr}`);
            }
            return result.stdout;
        });
    }
    /**
     * List all virtual machines on the Hyper-V host
     */
    listVMs() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.executePowerShell('Get-VM | Select-Object Name, State, Status, CPUUsage, ' +
                    'MemoryAssigned, Uptime, VMID, Generation, DynamicMemoryEnabled | ' +
                    'ConvertTo-Json -Depth 1');
                // If there's only one VM, PowerShell returns an object instead of an array
                const jsonResult = JSON.parse(result || '[]');
                const vms = Array.isArray(jsonResult) ? jsonResult : [jsonResult];
                // Format the results
                return vms.map(vm => ({
                    name: vm.Name,
                    state: vm.State,
                    cpuUsage: vm.CPUUsage,
                    memoryAssigned: this.formatMemorySize(vm.MemoryAssigned),
                    uptime: vm.Uptime,
                    vmId: vm.VMID,
                    generation: vm.Generation,
                    dynamicMemoryEnabled: vm.DynamicMemoryEnabled
                }));
            }
            catch (error) {
                if (error instanceof SyntaxError) {
                    // JSON parsing error - likely empty result or malformed JSON
                    return [];
                }
                throw error;
            }
        });
    }
    /**
     * Get detailed information about a specific VM
     */
    getVMDetails(vmName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get basic VM information
                const vmInfoCommand = `Get-VM -Name "${vmName}" | ` +
                    'Select-Object Name, State, Status, CPUUsage, MemoryAssigned, ' +
                    'Uptime, VMID, Generation, DynamicMemoryEnabled | ' +
                    'ConvertTo-Json -Depth 1';
                const vmInfoResult = yield this.executePowerShell(vmInfoCommand);
                const vmInfo = JSON.parse(vmInfoResult);
                // Get network adapters
                const networkCommand = `Get-VMNetworkAdapter -VMName "${vmName}" | ` +
                    'Select-Object SwitchName, MacAddress, IPAddresses | ' +
                    'ConvertTo-Json -Depth 2';
                const networkResult = yield this.executePowerShell(networkCommand);
                let networkAdapters = [];
                try {
                    const networkData = JSON.parse(networkResult || '[]');
                    networkAdapters = Array.isArray(networkData) ? networkData : [networkData];
                }
                catch (e) {
                    networkAdapters = [];
                }
                // Get hard drives
                const hardDriveCommand = `Get-VMHardDiskDrive -VMName "${vmName}" | ` +
                    'Select-Object Path, ControllerType, ControllerNumber, ControllerLocation | ' +
                    'ConvertTo-Json -Depth 1';
                const hardDriveResult = yield this.executePowerShell(hardDriveCommand);
                let hardDrives = [];
                try {
                    const hardDriveData = JSON.parse(hardDriveResult || '[]');
                    hardDrives = Array.isArray(hardDriveData) ? hardDriveData : [hardDriveData];
                }
                catch (e) {
                    hardDrives = [];
                }
                return {
                    name: vmInfo.Name,
                    state: vmInfo.State,
                    cpuUsage: vmInfo.CPUUsage,
                    memoryAssigned: this.formatMemorySize(vmInfo.MemoryAssigned),
                    uptime: vmInfo.Uptime,
                    vmId: vmInfo.VMID,
                    generation: vmInfo.Generation,
                    dynamicMemoryEnabled: vmInfo.DynamicMemoryEnabled,
                    networkAdapters: networkAdapters.map((na) => `${na.SwitchName || 'Not connected'} - MAC: ${na.MacAddress} - IP: ${na.IPAddresses ? na.IPAddresses.join(', ') : 'None'}`),
                    hardDrives: hardDrives.map((hd) => `${hd.Path} - ${hd.ControllerType} (${hd.ControllerNumber}:${hd.ControllerLocation})`)
                };
            }
            catch (error) {
                throw new Error(`Failed to get VM details: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
    /**
     * Start a virtual machine
     */
    startVM(vmName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.executePowerShell(`Start-VM -Name "${vmName}"`);
            }
            catch (error) {
                throw new Error(`Failed to start VM: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
    /**
     * Stop a virtual machine
     */
    stopVM(vmName_1) {
        return __awaiter(this, arguments, void 0, function* (vmName, force = false) {
            try {
                const command = force
                    ? `Stop-VM -Name "${vmName}" -Force`
                    : `Stop-VM -Name "${vmName}" -TurnOff`;
                yield this.executePowerShell(command);
            }
            catch (error) {
                throw new Error(`Failed to stop VM: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
    /**
     * Create a new virtual machine
     */
    createVM(options) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Create a new VHD if path not provided
                const vhdPath = options.vhdPath ||
                    `C:\\Users\\Public\\Documents\\Hyper-V\\Virtual Hard Disks\\${options.name}.vhdx`;
                // Create VHD
                if (!options.vhdPath) {
                    yield this.executePowerShell(`New-VHD -Path "${vhdPath}" -SizeBytes ${options.diskSizeInGB * 1024 * 1024 * 1024} -Dynamic`);
                }
                // Get default switch if not specified
                let switchName = options.switchName;
                if (!switchName) {
                    const switchResult = yield this.executePowerShell('Get-VMSwitch | Where-Object { $_.SwitchType -eq "Internal" } | Select-Object -First 1 -ExpandProperty Name');
                    switchName = switchResult.trim();
                    if (!switchName) {
                        // Try to find any switch
                        const anySwitchResult = yield this.executePowerShell('Get-VMSwitch | Select-Object -First 1 -ExpandProperty Name');
                        switchName = anySwitchResult.trim();
                    }
                }
                // Create the VM
                const generation = options.generation || 2;
                yield this.executePowerShell(`New-VM -Name "${options.name}" -MemoryStartupBytes ${options.memoryInGB * 1024 * 1024 * 1024} ` +
                    `-Generation ${generation} -VHDPath "${vhdPath}" ` +
                    `${switchName ? `-SwitchName "${switchName}"` : ''}`);
                // Configure CPU
                yield this.executePowerShell(`Set-VMProcessor -VMName "${options.name}" -Count ${options.cpuCount}`);
                // Mount ISO if provided
                if (options.isoPath) {
                    yield this.executePowerShell(`Add-VMDvdDrive -VMName "${options.name}" -Path "${options.isoPath}"`);
                    // Set boot order for Generation 2 VMs
                    if (generation === 2) {
                        yield this.executePowerShell(`Set-VMFirmware -VMName "${options.name}" -EnableSecureBoot Off -FirstBootDevice ` +
                            `(Get-VMDvdDrive -VMName "${options.name}")`);
                    }
                }
                // Get and return the VM info
                return yield this.getVMDetails(options.name);
            }
            catch (error) {
                throw new Error(`Failed to create VM: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
    /**
     * Delete a virtual machine
     */
    deleteVM(vmName_1) {
        return __awaiter(this, arguments, void 0, function* (vmName, removeDisks = false) {
            try {
                // Stop the VM if it's running
                const vmInfo = yield this.getVMDetails(vmName);
                if (vmInfo.state === 'Running') {
                    yield this.stopVM(vmName, true);
                }
                // Get disk info before removing if we need to remove disks
                let diskPaths = [];
                if (removeDisks) {
                    const diskResult = yield this.executePowerShell(`Get-VMHardDiskDrive -VMName "${vmName}" | Select-Object -ExpandProperty Path`);
                    diskPaths = diskResult.split('\n').map(path => path.trim()).filter(path => path);
                }
                // Delete the VM
                yield this.executePowerShell(`Remove-VM -Name "${vmName}" -Force`);
                // Remove disks if requested
                if (removeDisks) {
                    for (const diskPath of diskPaths) {
                        try {
                            yield this.executePowerShell(`Remove-Item -Path "${diskPath}" -Force`);
                        }
                        catch (error) {
                            console.warn(`Warning: Failed to remove disk ${diskPath}: ${error}`);
                        }
                    }
                }
            }
            catch (error) {
                throw new Error(`Failed to delete VM: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
    /**
     * Get a list of virtual switches
     */
    listSwitches() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.executePowerShell('Get-VMSwitch | Select-Object Name, SwitchType, NetAdapterInterfaceDescription | ConvertTo-Json -Depth 1');
                // If there's only one switch, PowerShell returns an object instead of an array
                const jsonResult = JSON.parse(result || '[]');
                return Array.isArray(jsonResult) ? jsonResult : [jsonResult];
            }
            catch (error) {
                if (error instanceof SyntaxError) {
                    // JSON parsing error - likely empty result
                    return [];
                }
                throw error;
            }
        });
    }
    /**
     * Create a checkpoint (snapshot) of a VM
     */
    createCheckpoint(vmName, checkpointName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.executePowerShell(`Checkpoint-VM -Name "${vmName}" -SnapshotName "${checkpointName}"`);
            }
            catch (error) {
                throw new Error(`Failed to create checkpoint: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
    /**
     * Attach an ISO file to a VM
     */
    attachISO(vmName, isoPath) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if VM already has a DVD drive
                const dvdDriveCommand = `Get-VMDvdDrive -VMName "${vmName}" | Select-Object -ExpandProperty ControllerLocation`;
                const dvdDriveResult = yield this.executePowerShell(dvdDriveCommand);
                const hasDvdDrive = dvdDriveResult.trim().length > 0;
                if (hasDvdDrive) {
                    // Update existing DVD drive
                    yield this.executePowerShell(`Set-VMDvdDrive -VMName "${vmName}" -Path "${isoPath}"`);
                }
                else {
                    // Add a new DVD drive with the ISO
                    yield this.executePowerShell(`Add-VMDvdDrive -VMName "${vmName}" -Path "${isoPath}"`);
                    // Get VM generation to determine if we need to update boot order
                    const generationCommand = `Get-VM -Name "${vmName}" | Select-Object -ExpandProperty Generation`;
                    const generationResult = yield this.executePowerShell(generationCommand);
                    const generation = parseInt(generationResult.trim(), 10);
                    // Set boot order for Generation 2 VMs
                    if (generation === 2) {
                        yield this.executePowerShell(`Set-VMFirmware -VMName "${vmName}" -EnableSecureBoot Off -FirstBootDevice ` +
                            `(Get-VMDvdDrive -VMName "${vmName}")`);
                    }
                }
            }
            catch (error) {
                throw new Error(`Failed to attach ISO: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
    /**
     * Get checkpoints for a VM
     */
    listCheckpoints(vmName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.executePowerShell(`Get-VMSnapshot -VMName "${vmName}" | Select-Object Name, CreationTime | ConvertTo-Json -Depth 1`);
                // If there's only one checkpoint, PowerShell returns an object instead of an array
                const jsonResult = JSON.parse(result || '[]');
                return Array.isArray(jsonResult) ? jsonResult : [jsonResult];
            }
            catch (error) {
                if (error instanceof SyntaxError) {
                    // JSON parsing error - likely empty result
                    return [];
                }
                throw error;
            }
        });
    }
    /**
     * Restore a VM to a checkpoint
     */
    restoreCheckpoint(vmName, checkpointName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.executePowerShell(`Restore-VMSnapshot -VMName "${vmName}" -Name "${checkpointName}" -Confirm:$false`);
            }
            catch (error) {
                throw new Error(`Failed to restore checkpoint: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
    /**
     * Format memory size to human-readable format
     */
    formatMemorySize(bytes) {
        if (bytes === 0)
            return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
    }
    // Note: createUbuntuVM and generateUbuntuAutoinstallISO methods were removed
    // as they are not compatible with Type 2 hypervisor deployments
    /**
     * Get Hyper-V host information
     */
    getHostInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.executePowerShell('Get-ComputerInfo | Select-Object CsName, CsDomain, OsName, OsVersion, ' +
                    'CsProcessors, CsNumberOfLogicalProcessors, CsNumberOfProcessors, ' +
                    'OsTotalVisibleMemorySize, OsFreePhysicalMemory | ConvertTo-Json -Depth 1');
                return JSON.parse(result);
            }
            catch (error) {
                throw new Error(`Failed to get host info: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
}
exports.HyperVManager = HyperVManager;
