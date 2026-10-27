declare module 'draco3dgltf' {
  const moduleFactory: {
    createDecoderModule(options?: Record<string, unknown>): Promise<unknown>;
    createEncoderModule(options?: Record<string, unknown>): Promise<unknown>;
  };
  export default moduleFactory;
}
