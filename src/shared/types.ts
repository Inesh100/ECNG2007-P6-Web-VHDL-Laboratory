
export interface VhdlFile {
  id: string;
  name: string;
  content: string;
}

export interface Workspace {
  files: VhdlFile[];
  activeFileId: string;
}
