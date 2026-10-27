import type {NodeFileView} from '../../ui/node-file-types';
export function projectNodeFile(node:Record<string,any>,state?:Record<string,any>):NodeFileView|null;
export function nodeFileSetupIssue(view:NodeFileView|null):{code:string;field:string;category:'setup';message:string}|null;
