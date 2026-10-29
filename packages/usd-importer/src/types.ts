export interface IUsdBridgeObject {
  readonly name: string;
  readonly objectType: 'MESH' | 'EMPTY';
  readonly parentName?: string;
  readonly meshData?: string;
  readonly usdPrimPath?: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly customProperties: Readonly<Record<string, unknown>>;
}

export interface IUsdBridgeReport {
  readonly success: true;
  readonly converter: 'blender';
  readonly toolVersion: string;
  readonly blenderVersion: string;
  readonly objects: readonly IUsdBridgeObject[];
}

export interface IUsdBridgeRequest {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly reportPath: string;
}

export interface IUsdBridgeProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean;
}

export type IUsdBridgeRunner = (
  args: readonly string[],
  options: Readonly<{ timeoutMs: number }>,
) => Promise<IUsdBridgeProcessResult>;

export interface IUsdBridgeOptions {
  readonly blenderBinary: string;
  readonly scriptPath: string;
  readonly timeoutMs?: number;
  readonly runner?: IUsdBridgeRunner;
}
