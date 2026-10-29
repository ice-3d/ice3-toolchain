export interface IFbxBridgeObject {
  readonly name: string;
  readonly objectType: 'MESH' | 'EMPTY';
  readonly parentName?: string;
  readonly meshData?: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly customProperties: Readonly<Record<string, unknown>>;
}

export interface IFbxBridgeReport {
  readonly success: true;
  readonly blenderVersion: string;
  readonly objects: readonly IFbxBridgeObject[];
}

export interface IFbxBridgeRequest {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly reportPath: string;
}

export interface IFbxBridgeProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean;
}

export type IFbxBridgeRunner = (
  args: readonly string[],
  options: Readonly<{ timeoutMs: number }>,
) => Promise<IFbxBridgeProcessResult>;

export interface IFbxBridgeOptions {
  readonly blenderBinary: string;
  readonly scriptPath: string;
  readonly timeoutMs?: number;
  readonly runner?: IFbxBridgeRunner;
}
