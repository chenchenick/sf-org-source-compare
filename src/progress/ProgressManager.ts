import * as vscode from 'vscode';
import { ConfigurationManager } from '../config/ConfigurationManager';

/**
 * Progress step information for multi-step operations
 */
export interface ProgressStep {
    name: string;
    description: string;
    weight: number; // Relative weight for progress calculation (1-100)
    estimatedDuration?: number; // Estimated duration in milliseconds
}

/**
 * Progress operation configuration
 */
export interface ProgressOperation {
    title: string;
    location: vscode.ProgressLocation;
    cancellable: boolean;
    steps: ProgressStep[];
    totalEstimatedDuration?: number;
}

/**
 * Progress state for tracking operation progress
 */
interface ProgressState {
    currentStep: number;
    currentStepProgress: number; // 0-100
    overallProgress: number; // 0-100
    startTime: Date;
    operation: ProgressOperation;
    token?: vscode.CancellationToken;
    resolve?: (value: any) => void;
    reject?: (reason: any) => void;
}

/**
 * Predefined operations for consistent progress reporting
 */
export const PROGRESS_OPERATIONS = {
    ORG_REFRESH: {
        title: 'Refreshing Organization',
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
        steps: [
            { name: 'authenticate', description: 'Verifying authentication', weight: 10, estimatedDuration: 2000 },
            { name: 'retrieve', description: 'Retrieving metadata from org', weight: 70, estimatedDuration: 15000 },
            { name: 'process', description: 'Processing metadata files', weight: 15, estimatedDuration: 3000 },
            { name: 'cache', description: 'Updating cache', weight: 5, estimatedDuration: 1000 }
        ],
        totalEstimatedDuration: 21000
    },
    
    MULTI_ORG_REFRESH: {
        title: 'Refreshing Multiple Organizations',
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
        steps: [
            { name: 'prepare', description: 'Preparing refresh operation', weight: 5, estimatedDuration: 1000 },
            { name: 'refresh_orgs', description: 'Refreshing organizations', weight: 90, estimatedDuration: 30000 },
            { name: 'finalize', description: 'Finalizing and updating views', weight: 5, estimatedDuration: 1000 }
        ],
        totalEstimatedDuration: 32000
    },

    SOURCE_RETRIEVAL: {
        title: 'Retrieving Source Files',
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
        steps: [
            { name: 'manifest', description: 'Creating manifest file', weight: 5, estimatedDuration: 1000 },
            { name: 'execute', description: 'Executing source retrieve command', weight: 80, estimatedDuration: 20000 },
            { name: 'organize', description: 'Organizing retrieved files', weight: 15, estimatedDuration: 3000 }
        ],
        totalEstimatedDuration: 24000
    },

    FILE_COMPARISON: {
        title: 'Comparing Files',
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
        steps: [
            { name: 'prepare', description: 'Preparing file comparison', weight: 10, estimatedDuration: 500 },
            { name: 'read_files', description: 'Reading file contents', weight: 30, estimatedDuration: 2000 },
            { name: 'analyze', description: 'Analyzing differences', weight: 40, estimatedDuration: 3000 },
            { name: 'display', description: 'Preparing diff view', weight: 20, estimatedDuration: 1000 }
        ],
        totalEstimatedDuration: 6500
    },

    AUTHENTICATION: {
        title: 'Authenticating with Salesforce',
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
        steps: [
            { name: 'launch', description: 'Launching authentication', weight: 10, estimatedDuration: 1000 },
            { name: 'browser', description: 'Waiting for browser authentication', weight: 70, estimatedDuration: 30000 },
            { name: 'verify', description: 'Verifying credentials', weight: 15, estimatedDuration: 3000 },
            { name: 'save', description: 'Saving organization info', weight: 5, estimatedDuration: 1000 }
        ],
        totalEstimatedDuration: 35000
    },

    MANIFEST_GENERATION: {
        title: 'Generating Manifest',
        location: vscode.ProgressLocation.Window,
        cancellable: false,
        steps: [
            { name: 'analyze', description: 'Analyzing metadata types', weight: 20, estimatedDuration: 1000 },
            { name: 'generate', description: 'Generating manifest XML', weight: 60, estimatedDuration: 2000 },
            { name: 'validate', description: 'Validating manifest structure', weight: 20, estimatedDuration: 500 }
        ],
        totalEstimatedDuration: 3500
    }
};

/**
 * Centralized progress management for long-running operations
 */
export class ProgressManager {
    private static instance: ProgressManager;
    private configManager: ConfigurationManager;
    private activeOperations = new Map<string, ProgressState>();

    private constructor() {
        this.configManager = ConfigurationManager.getInstance();
    }

    public static getInstance(): ProgressManager {
        if (!ProgressManager.instance) {
            ProgressManager.instance = new ProgressManager();
        }
        return ProgressManager.instance;
    }

    /**
     * Start a progress operation with predefined steps
     */
    public async withProgress<T>(
        operationKey: keyof typeof PROGRESS_OPERATIONS,
        task: (progress: ProgressReporter) => Promise<T>,
        operationId?: string
    ): Promise<T> {
        const operation = PROGRESS_OPERATIONS[operationKey];
        return this.withCustomProgress(operation, task, operationId);
    }

    /**
     * Start a progress operation with custom configuration
     */
    public async withCustomProgress<T>(
        operation: ProgressOperation,
        task: (progress: ProgressReporter) => Promise<T>,
        operationId?: string
    ): Promise<T> {
        // Check if progress indicators are enabled
        if (!this.shouldShowProgress()) {
            // Execute task without progress indicators
            return task(new NoOpProgressReporter());
        }

        const id = operationId || `operation_${Date.now()}`;
        
        return vscode.window.withProgress(
            {
                location: operation.location,
                title: operation.title,
                cancellable: operation.cancellable
            },
            async (progress, token) => {
                const state: ProgressState = {
                    currentStep: 0,
                    currentStepProgress: 0,
                    overallProgress: 0,
                    startTime: new Date(),
                    operation,
                    token
                };

                this.activeOperations.set(id, state);
                const progressReporter = new ProgressReporter(id, this, progress);

                try {
                    const result = await task(progressReporter);
                    progressReporter.complete();
                    return result;
                } catch (error) {
                    progressReporter.fail(error instanceof Error ? error.message : 'Operation failed');
                    throw error;
                } finally {
                    this.activeOperations.delete(id);
                }
            }
        );
    }

    /**
     * Create a simple progress indicator for basic operations
     */
    public async withSimpleProgress<T>(
        title: string,
        task: (progress: (message: string, increment?: number) => void) => Promise<T>,
        options: {
            location?: vscode.ProgressLocation;
            cancellable?: boolean;
        } = {}
    ): Promise<T> {
        if (!this.shouldShowProgress()) {
            return task(() => {});
        }

        return vscode.window.withProgress(
            {
                location: options.location || vscode.ProgressLocation.Notification,
                title,
                cancellable: options.cancellable || false
            },
            async (progress) => {
                return task((message: string, increment?: number) => {
                    progress.report({ message, increment });
                });
            }
        );
    }

    /**
     * Update progress for an active operation
     */
    public updateProgress(
        operationId: string,
        stepIndex: number,
        stepProgress: number,
        message?: string
    ): void {
        const state = this.activeOperations.get(operationId);
        if (!state) return;

        state.currentStep = stepIndex;
        state.currentStepProgress = stepProgress;

        // Calculate overall progress
        const steps = state.operation.steps;
        const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);
        
        let completedWeight = 0;
        for (let i = 0; i < stepIndex; i++) {
            completedWeight += steps[i].weight;
        }
        
        if (stepIndex < steps.length) {
            completedWeight += (steps[stepIndex].weight * stepProgress) / 100;
        }
        
        state.overallProgress = Math.round((completedWeight / totalWeight) * 100);
    }

    /**
     * Get current progress state for an operation
     */
    public getProgressState(operationId: string): ProgressState | undefined {
        return this.activeOperations.get(operationId);
    }

    /**
     * Cancel an active operation if it supports cancellation
     */
    public cancelOperation(operationId: string): boolean {
        const state = this.activeOperations.get(operationId);
        if (state && state.operation.cancellable && state.token) {
            // Note: VS Code handles cancellation through the token
            return state.token.isCancellationRequested;
        }
        return false;
    }

    /**
     * Get all active operations
     */
    public getActiveOperations(): Map<string, ProgressState> {
        return new Map(this.activeOperations);
    }

    /**
     * Check if progress indicators should be shown based on configuration
     */
    private shouldShowProgress(): boolean {
        return this.configManager.shouldShowProgress();
    }

    /**
     * Calculate estimated time remaining for an operation
     */
    public getEstimatedTimeRemaining(operationId: string): number | undefined {
        const state = this.activeOperations.get(operationId);
        if (!state || !state.operation.totalEstimatedDuration) return undefined;

        const elapsed = Date.now() - state.startTime.getTime();
        const progressRatio = state.overallProgress / 100;
        
        if (progressRatio <= 0) return state.operation.totalEstimatedDuration;
        
        const estimatedTotal = elapsed / progressRatio;
        return Math.max(0, estimatedTotal - elapsed);
    }
}

/**
 * Progress reporter for individual operations
 */
export class ProgressReporter {
    constructor(
        private operationId: string,
        private manager: ProgressManager,
        private vsCodeProgress: vscode.Progress<{ message?: string; increment?: number }>
    ) {}

    /**
     * Start a specific step in the operation
     */
    public startStep(stepIndex: number, customMessage?: string): void {
        const state = this.manager.getProgressState(this.operationId);
        if (!state) return;

        const step = state.operation.steps[stepIndex];
        if (!step) return;

        this.manager.updateProgress(this.operationId, stepIndex, 0);
        
        const message = customMessage || step.description;
        const estimatedTime = this.manager.getEstimatedTimeRemaining(this.operationId);
        const timeMessage = estimatedTime ? ` (${Math.round(estimatedTime / 1000)}s remaining)` : '';
        
        this.vsCodeProgress.report({
            message: `${message}${timeMessage}`,
            increment: 0
        });
    }

    /**
     * Update progress within the current step
     */
    public updateStep(stepProgress: number, message?: string): void {
        const state = this.manager.getProgressState(this.operationId);
        if (!state) return;

        this.manager.updateProgress(this.operationId, state.currentStep, stepProgress, message);
        
        if (message) {
            const estimatedTime = this.manager.getEstimatedTimeRemaining(this.operationId);
            const timeMessage = estimatedTime ? ` (${Math.round(estimatedTime / 1000)}s remaining)` : '';
            
            this.vsCodeProgress.report({
                message: `${message}${timeMessage}`
            });
        }
    }

    /**
     * Complete the current step and move to the next
     */
    public completeStep(stepIndex: number): void {
        this.manager.updateProgress(this.operationId, stepIndex, 100);
        
        if (stepIndex + 1 < this.getStepCount()) {
            this.startStep(stepIndex + 1);
        }
    }

    /**
     * Complete the entire operation
     */
    public complete(): void {
        const state = this.manager.getProgressState(this.operationId);
        if (!state) return;

        this.manager.updateProgress(this.operationId, state.operation.steps.length, 100);
        this.vsCodeProgress.report({
            message: 'Complete',
            increment: 100
        });
    }

    /**
     * Report operation failure
     */
    public fail(message: string): void {
        this.vsCodeProgress.report({
            message: `Failed: ${message}`
        });
    }

    /**
     * Check if the operation was cancelled
     */
    public isCancelled(): boolean {
        const state = this.manager.getProgressState(this.operationId);
        return state?.token?.isCancellationRequested || false;
    }

    /**
     * Get the total number of steps
     */
    public getStepCount(): number {
        const state = this.manager.getProgressState(this.operationId);
        return state?.operation.steps.length || 0;
    }

    /**
     * Get current step information
     */
    public getCurrentStep(): ProgressStep | undefined {
        const state = this.manager.getProgressState(this.operationId);
        if (!state) return undefined;
        return state.operation.steps[state.currentStep];
    }
}

/**
 * No-op progress reporter for when progress is disabled
 */
class NoOpProgressReporter extends ProgressReporter {
    constructor() {
        super('', {} as any, {} as any);
    }

    public startStep(): void {}
    public updateStep(): void {}
    public completeStep(): void {}
    public complete(): void {}
    public fail(): void {}
    public isCancelled(): boolean { return false; }
    public getStepCount(): number { return 0; }
    public getCurrentStep(): undefined { return undefined; }
}