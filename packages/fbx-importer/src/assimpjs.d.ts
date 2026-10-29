declare module 'assimpjs' {
  interface AssimpResultFile {
    GetContent(): Uint8Array;
  }

  interface AssimpResult {
    IsSuccess(): boolean;
    FileCount(): number;
    GetFile(index: number): AssimpResultFile;
    GetErrorCode(): string;
  }

  interface AssimpFileList {
    AddFile(name: string, content: Uint8Array): void;
  }

  interface AssimpModule {
    FileList: new () => AssimpFileList;
    ConvertFileList(fileList: AssimpFileList, format: string): AssimpResult;
  }

  function createAssimp(): Promise<AssimpModule>;
  export default createAssimp;
}
