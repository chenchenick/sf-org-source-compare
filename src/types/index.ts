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