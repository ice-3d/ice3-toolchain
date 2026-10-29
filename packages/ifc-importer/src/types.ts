export interface IIfcMetadata {
  readonly projectId: number;
  readonly nodes: readonly IIfcMetadataNode[];
  readonly products: readonly IIfcProductMetadata[];
  readonly systems: readonly IIfcSystemMetadata[];
  readonly warnings: readonly string[];
}

export interface IIfcMetadataNode {
  readonly expressId: number;
  readonly ifcType: string;
  readonly name: string;
  readonly children: readonly number[];
}

export interface IIfcPropertySetMetadata {
  readonly name: string;
  readonly properties: Readonly<Record<string, IIfcPrimitive | readonly IIfcPrimitive[]>>;
}

export interface IIfcSystemReference {
  readonly globalId?: string;
  readonly name: string;
  readonly ifcType: string;
}

export interface IIfcSystemMetadata extends IIfcSystemReference {
  readonly expressId: number;
  readonly members: readonly string[];
}

export interface IIfcProductMetadata {
  readonly expressId: number;
  readonly ifcType: string;
  readonly globalId?: string;
  readonly selectionId: string;
  readonly name: string;
  readonly description?: string;
  readonly objectType?: string;
  readonly predefinedType?: string;
  readonly tag?: string;
  readonly propertySets: readonly IIfcPropertySetMetadata[];
  readonly systems: readonly IIfcSystemReference[];
}

export type IIfcPrimitive = string | number | boolean;
