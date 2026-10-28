import type {NodeFileView} from '../../ui/node-file-types';
export function projectNodeFile(node:Record<string,any>,state?:Record<string,any>):NodeFileView|null;
export function nodeFileSetupIssue(view:NodeFileView|null):{code:string;field:string;category:'setup';message:string}|null;
export function managedNodeFileMigration(node:Record<string,any>,options?:{hasCanonicalData?:boolean}):Record<string,unknown>|null;
export function nodeFileOwnsControl(operation:string,key:string):boolean;
export function nodeFileContentIssue(view:NodeFileView|null):{code:string;field:string;category:'connection';message:string}|null;
