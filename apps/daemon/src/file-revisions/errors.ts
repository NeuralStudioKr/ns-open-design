export class FileRevisionPayloadTooLargeError extends Error {
  readonly code = 'FILE_REVISION_PAYLOAD_TOO_LARGE' as const;

  constructor(
    readonly limitBytes: number,
    readonly actualBytes: number,
  ) {
    super(`revision snapshot exceeds absolute limit of ${limitBytes} bytes (got ${actualBytes})`);
    this.name = 'FileRevisionPayloadTooLargeError';
  }
}
