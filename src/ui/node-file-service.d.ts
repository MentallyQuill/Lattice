import type {NodeFileAccess} from './node-file-access';
export function createNodeFileService(ports:{server:NodeFileAccess;native:NodeFileAccess}):NodeFileAccess;
