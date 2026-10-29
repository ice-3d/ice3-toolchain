declare module 'assimpjs' {
  interface IAssimpFile {
    GetContent(): Uint8Array;
  }

  interface IAssimpResult {
    IsSuccess(): boolean;
    FileCount(): number;
    GetFile(index: number): IAssimpFile;
  }

  interface IAssimpFileList {
    AddFile(name: string, content: Uint8Array): void;
  }

  interface IAssimp {
    FileList: new () => IAssimpFileList;
    ConvertFileList(
      input: IAssimpFileList,
      format: string,
    ): IAssimpResult;
  }

  export default function createAssimp(): Promise<IAssimp>;
}
