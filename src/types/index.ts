export interface SalesforceOrg {
    id: string;
    username: string;
    alias?: string;
    instanceUrl: string;
    accessToken?: string;
}

export interface OrgFile {
    id: string;
    name: string;
    type: string;
    fullName: string;
    content?: string;
    orgId: string;
    isMetaFile?: boolean;
    filePath?: string;
    bundleName?: string;
    orgDisplayName?: string; // For webview display
}

export interface CompareSelection {
    leftFile?: OrgFile;
    rightFile?: OrgFile;
    leftOrg?: SalesforceOrg;
    rightOrg?: SalesforceOrg;
}

export enum ItemType {
    Org = 'org',
    File = 'file',
    Folder = 'folder'
}

export interface TreeItem {
    id: string;
    label: string;
    type: ItemType;
    children?: TreeItem[];
    orgId?: string;
    file?: OrgFile;
    metadataType?: string;
}

// Enhanced metadata system interfaces
export interface BundleContent {
    files: Map<string, string>;
    mainFile?: string;
    bundleType: 'lwc' | 'aura' | 'other';
}

export interface ContentRequest {
    orgId: string;
    file: OrgFile;
    priority?: 'high' | 'medium' | 'low';
}

export interface ContentResponse {
    request: ContentRequest;
    content?: string | BundleContent;
    error?: string;
    success: boolean;
}

export interface MetadataTypeDefinition {
    name: string;
    displayName: string;
    fileExtensions: string[];
    isBundle: boolean;
    retrievalStrategy: 'tooling' | 'retrieve' | 'soql' | 'custom';
    children?: MetadataTypeDefinition[];
    sfCliMetadataType?: string;
    supportedOperations: ('list' | 'retrieve' | 'query')[];
}

export interface MetadataHandlerConfig {
    enabled: boolean;
    parallel: boolean;
    maxConcurrency?: number;
    retryCount?: number;
    timeout?: number;
}

export interface ProcessingResult<T> {
    success: T[];
    failures: { item: any; error: string }[];
    processingTime: number;
}

export interface MetadataQueryOptions {
    orgId: string;
    metadataTypes: string[];
    parallel?: boolean;
    maxConcurrency?: number;
    includeManaged?: boolean;
}

export interface ValidationRule {
    fullName: string;
    active: boolean;
    description?: string;
    errorConditionFormula: string;
    errorMessage: string;
    errorDisplayField?: string;
}

export interface CustomField {
    fullName: string;
    label: string;
    type: string;
    length?: number;
    required?: boolean;
    unique?: boolean;
    description?: string;
}

export interface EnhancedObjectMetadata {
    fullName: string;
    label?: string;
    description?: string;
    customFields?: CustomField[];
    validationRules?: ValidationRule[];
    sharingModel?: string;
    enableHistory?: boolean;
    enableActivities?: boolean;
    enableBulkApi?: boolean;
    enableReports?: boolean;
    enableSearch?: boolean;
    enableSharing?: boolean;
    enableStreamingApi?: boolean;
}

export interface LWCBundle {
    componentName: string;
    files: {
        html?: string;
        js?: string;
        css?: string;
        xml?: string;
        svg?: string;
        test?: string;
    };
}

export interface AuraBundle {
    componentName: string;
    files: {
        cmp?: string;
        controller?: string;
        helper?: string;
        style?: string;
        renderer?: string;
        design?: string;
        svg?: string;
        documentation?: string;
        auradoc?: string;
    };
}