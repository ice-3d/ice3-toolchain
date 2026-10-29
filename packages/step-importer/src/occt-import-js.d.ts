declare module 'occt-import-js' {
  interface OcctImportModule {
    ReadStepFile(
      content: Uint8Array,
      params: Readonly<Record<string, unknown>> | null,
    ): unknown;
  }

  function createOcctImporter(): Promise<OcctImportModule>;

  export default createOcctImporter;
}
