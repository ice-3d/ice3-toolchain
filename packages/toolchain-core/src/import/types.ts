export interface ICESourceImportInput {
  readonly path: string;
  readonly requestedAdapter?: string;
}

export interface ICESourceImportContext {
  readonly temporaryDirectory: string;
  readonly assetId: string;
}

export interface ICESourceImportResult {
  readonly adapterId: string;
  readonly sourceFormat: string;
  readonly sourceGlbPath: string;
  readonly warnings: readonly string[];
}

export interface ICESourceImporterCapabilities {
  readonly hierarchy: boolean;
  readonly vertexColors: boolean;
  readonly materialColors: boolean;
  readonly instances: boolean;
  readonly semanticMetadata: boolean;
}

export interface ICESourceImporter {
  readonly id: string;
  readonly extensions: readonly string[];
  readonly capabilities: Readonly<ICESourceImporterCapabilities>;
  import(
    input: ICESourceImportInput,
    context: ICESourceImportContext,
  ): Promise<ICESourceImportResult>;
}

export interface ICEImporterRegistry {
  resolve(path: string, requestedAdapter?: string): ICESourceImporter;
  import(
    input: ICESourceImportInput,
    context: ICESourceImportContext,
  ): Promise<ICESourceImportResult>;
}
