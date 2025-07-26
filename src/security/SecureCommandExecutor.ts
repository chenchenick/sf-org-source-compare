import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { SF_CONFIG } from '../config';

/**
 * Secure command execution utility to prevent command injection vulnerabilities
 * All SF CLI commands should go through this utility for proper sanitization
 */
export class SecureCommandExecutor {
    private static readonly execAsync = promisify(exec);
    
    // Whitelist of allowed SF CLI commands
    private static readonly ALLOWED_COMMANDS = [
        'sf',
        'sfdx'
    ] as const;

    // Whitelist of allowed SF CLI subcommands
    private static readonly ALLOWED_SUBCOMMANDS = [
        'org',
        'project', 
        'data',
        'sobject',
        'apex'
    ] as const;

    // Whitelist of allowed SF CLI operations
    private static readonly ALLOWED_OPERATIONS = [
        'list',
        'retrieve',
        'query',
        'describe',
        '--version'
    ] as const;

    // Whitelist of allowed metadata types
    private static readonly ALLOWED_METADATA_TYPES = [
        'ApexClass',
        'ApexTrigger',
        'LightningComponentBundle', 
        'AuraDefinitionBundle',
        'CustomObject',
        'Flow',
        'Layout',
        'PermissionSet',
        'Profile',
        'CustomField',
        'ValidationRule',
        'WorkflowRule',
        'StaticResource',
        'CustomTab',
        'CustomApplication',
        'CustomLabel',
        'EmailTemplate',
        'Report',
        'Dashboard'
    ] as const;

    // Regex patterns for input validation
    private static readonly VALIDATION_PATTERNS = {
        ORG_IDENTIFIER: /^[a-zA-Z0-9._@-]+$/,
        SALESFORCE_ID: /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/,
        API_VERSION: /^[0-9]{1,3}\.[0-9]$/,
        METADATA_NAME: /^[a-zA-Z0-9_]+$/,
        FILE_PATH: /^[a-zA-Z0-9._\-\/\\:]+$/,
        SOQL_SAFE: /^[a-zA-Z0-9\s,()_.'=<>!]+$/
    } as const;

    /**
     * Safely execute SF CLI command using spawn (preferred method)
     */
    public static async executeCommand(
        command: string, 
        args: string[], 
        options: {
            timeout?: number;
            cwd?: string;
            orgIdentifier?: string;
        } = {}
    ): Promise<{ stdout: string; stderr: string }> {
        // Validate base command
        if (!this.isAllowedCommand(command)) {
            throw new Error(`Security violation: Command '${command}' is not allowed`);
        }

        // Sanitize all arguments
        const sanitizedArgs = args.map(arg => this.sanitizeArgument(arg));

        // Validate arguments for suspicious content
        this.validateArguments(sanitizedArgs);

        // Set timeout from configuration
        const timeout = options.timeout || SF_CONFIG.TIMEOUTS.CLI_COMMAND;

        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let processCompleted = false;

            const childProcess = spawn(command, sanitizedArgs, {
                cwd: options.cwd,
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: false // Never use shell to prevent command injection
            });

            // Set timeout
            const timeoutHandle = setTimeout(() => {
                if (!processCompleted) {
                    processCompleted = true;
                    childProcess.kill('SIGTERM');
                    
                    // Force kill after grace period
                    setTimeout(() => {
                        if (!childProcess.killed) {
                            childProcess.kill('SIGKILL');
                        }
                    }, SF_CONFIG.TIMEOUTS.PROCESS_KILL);
                    
                    reject(new Error(`Command timeout: ${command} ${sanitizedArgs.join(' ')}`));
                }
            }, timeout);

            childProcess.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            childProcess.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            childProcess.on('error', (error: Error) => {
                if (!processCompleted) {
                    processCompleted = true;
                    clearTimeout(timeoutHandle);
                    reject(new Error(`Failed to execute command: ${error.message}`));
                }
            });

            childProcess.on('close', (code: number) => {
                if (!processCompleted) {
                    processCompleted = true;
                    clearTimeout(timeoutHandle);

                    if (code === 0) {
                        resolve({ stdout, stderr });
                    } else {
                        reject(new Error(`Command failed with code ${code}: ${stderr || 'Unknown error'}`));
                    }
                }
            });
        });
    }

    /**
     * Execute SF org list command safely
     */
    public static async executeOrgList(): Promise<{ stdout: string; stderr: string }> {
        return this.executeCommand('sf', ['org', 'list', '--json']);
    }

    /**
     * Execute SF org list metadata command safely
     */
    public static async executeOrgListMetadata(
        metadataType: string,
        orgIdentifier: string
    ): Promise<{ stdout: string; stderr: string }> {
        // Validate inputs
        this.validateMetadataType(metadataType);
        this.validateOrgIdentifier(orgIdentifier);

        return this.executeCommand('sf', [
            'org',
            'list',
            'metadata',
            '--metadata-type',
            metadataType,
            '--target-org',
            orgIdentifier,
            '--json'
        ]);
    }

    /**
     * Execute SF data query command safely
     */
    public static async executeDataQuery(
        soqlQuery: string,
        orgIdentifier: string,
        useToolingApi: boolean = false
    ): Promise<{ stdout: string; stderr: string }> {
        // Validate inputs
        this.validateSoqlQuery(soqlQuery);
        this.validateOrgIdentifier(orgIdentifier);

        const args = [
            'data',
            'query',
            '--query',
            soqlQuery,
            '--target-org',
            orgIdentifier
        ];

        if (useToolingApi) {
            args.push('--use-tooling-api');
        }

        args.push('--json');

        return this.executeCommand('sf', args);
    }

    /**
     * Execute SF project retrieve start command safely
     */
    public static async executeProjectRetrieve(
        manifestPath: string,
        orgIdentifier: string,
        targetDir?: string
    ): Promise<{ stdout: string; stderr: string }> {
        // Validate inputs
        this.validateFilePath(manifestPath);
        this.validateOrgIdentifier(orgIdentifier);

        const args = [
            'project',
            'retrieve',
            'start',
            '--manifest',
            manifestPath,
            '--target-org',
            orgIdentifier,
            '--json'
        ];

        const options: any = {};
        if (targetDir) {
            this.validateFilePath(targetDir);
            options.cwd = targetDir;
        }

        return this.executeCommand('sf', args, options);
    }

    /**
     * Execute SF sobject describe command safely
     */
    public static async executeSObjectDescribe(
        sobjectType: string,
        orgIdentifier: string
    ): Promise<{ stdout: string; stderr: string }> {
        // Validate inputs
        this.validateMetadataName(sobjectType);
        this.validateOrgIdentifier(orgIdentifier);

        return this.executeCommand('sf', [
            'sobject',
            'describe',
            '--sobject',
            sobjectType,
            '--target-org',
            orgIdentifier,
            '--json'
        ]);
    }

    /**
     * Check if CLI command exists
     */
    public static async checkCliAvailable(command: string): Promise<boolean> {
        if (!this.isAllowedCommand(command)) {
            return false;
        }

        try {
            await this.executeCommand(command, ['--version'], { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    // Private validation methods
    private static isAllowedCommand(command: string): boolean {
        return this.ALLOWED_COMMANDS.includes(command as any);
    }

    private static sanitizeArgument(arg: string): string {
        if (typeof arg !== 'string') {
            throw new Error('Security violation: All arguments must be strings');
        }

        // Remove null bytes and other dangerous characters
        const sanitized = arg
            .replace(/\0/g, '') // Remove null bytes
            .replace(/[\r\n]/g, ' ') // Replace newlines with spaces
            .trim();

        // Check for maximum length to prevent buffer overflow attacks
        if (sanitized.length > SF_CONFIG.SECURITY.MAX_COMMAND_ARG_LENGTH) {
            throw new Error('Security violation: Argument too long');
        }

        return sanitized;
    }

    private static validateArguments(args: string[]): void {
        for (const arg of args) {
            // Check for command injection patterns
            if (this.containsSuspiciousContent(arg)) {
                throw new Error(`Security violation: Suspicious content in argument: ${arg}`);
            }
        }
    }

    private static containsSuspiciousContent(input: string): boolean {
        // Check for command injection patterns
        const suspiciousPatterns = [
            /[;&|`$(){}[\]]/,  // Command separators and substitution
            /\$\{/,            // Variable substitution
            /\$\(/,            // Command substitution
            /`/,               // Backticks
            /<|>/,             // Redirection
            /\|\|/,            // OR operator
            /&&/,              // AND operator
            /\.\./,            // Directory traversal
            /\/etc\/|\/usr\/|\/var\//,  // System directories
            /rm\s+|del\s+|format\s+/i   // Dangerous commands
        ];

        return suspiciousPatterns.some(pattern => pattern.test(input));
    }

    private static validateOrgIdentifier(orgId: string): void {
        if (!orgId || typeof orgId !== 'string') {
            throw new Error('Invalid org identifier: must be a non-empty string');
        }

        if (!this.VALIDATION_PATTERNS.ORG_IDENTIFIER.test(orgId) && 
            !this.VALIDATION_PATTERNS.SALESFORCE_ID.test(orgId)) {
            throw new Error(`Invalid org identifier format: ${orgId}`);
        }
    }

    private static validateMetadataType(metadataType: string): void {
        if (!metadataType || typeof metadataType !== 'string') {
            throw new Error('Invalid metadata type: must be a non-empty string');
        }

        if (!this.ALLOWED_METADATA_TYPES.includes(metadataType as any)) {
            throw new Error(`Unsupported metadata type: ${metadataType}`);
        }
    }

    private static validateMetadataName(name: string): void {
        if (!name || typeof name !== 'string') {
            throw new Error('Invalid metadata name: must be a non-empty string');
        }

        if (!this.VALIDATION_PATTERNS.METADATA_NAME.test(name)) {
            throw new Error(`Invalid metadata name format: ${name}`);
        }
    }

    private static validateFilePath(filePath: string): void {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('Invalid file path: must be a non-empty string');
        }

        if (!this.VALIDATION_PATTERNS.FILE_PATH.test(filePath)) {
            throw new Error(`Invalid file path format: ${filePath}`);
        }

        // Check for forbidden path patterns
        if (SF_CONFIG.SECURITY.FORBIDDEN_PATHS.some(forbidden => filePath.includes(forbidden))) {
            throw new Error(`Security violation: Forbidden path pattern: ${filePath}`);
        }
    }

    private static validateSoqlQuery(query: string): void {
        if (!query || typeof query !== 'string') {
            throw new Error('Invalid SOQL query: must be a non-empty string');
        }

        // Basic SOQL validation - only allow safe characters
        if (!this.VALIDATION_PATTERNS.SOQL_SAFE.test(query)) {
            throw new Error('Invalid SOQL query: contains unsafe characters');
        }

        // Check query length
        if (query.length > 4000) {
            throw new Error('Invalid SOQL query: too long');
        }

        // Must start with SELECT
        if (!query.trim().toUpperCase().startsWith('SELECT')) {
            throw new Error('Invalid SOQL query: must start with SELECT');
        }
    }
}

/**
 * Legacy exec function wrapper for backward compatibility
 * @deprecated Use SecureCommandExecutor.executeCommand instead
 */
export async function safeExecCommand(
    command: string,
    timeout: number = SF_CONFIG.TIMEOUTS.CLI_COMMAND
): Promise<{ stdout: string; stderr: string }> {
    console.warn('safeExecCommand is deprecated. Use SecureCommandExecutor.executeCommand instead.');
    
    // Parse command and arguments
    const parts = command.trim().split(/\s+/);
    if (parts.length === 0) {
        throw new Error('Invalid command: empty command string');
    }

    const baseCommand = parts[0];
    const args = parts.slice(1);

    return SecureCommandExecutor.executeCommand(baseCommand, args, { timeout });
}