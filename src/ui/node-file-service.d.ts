import type {NodeFileAccess} from './node-file-access';
export function createNodeFileService(ports:{host?:NodeFileAccess;server:NodeFileAccess;native:NodeFileAccess;getStorageMode?:()=> 'inside'|'anywhere'}):NodeFileAccess;
