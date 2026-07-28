export class CloudError extends Error {
  constructor(status, code, publicMessage, internalMessage = publicMessage) {
    super(internalMessage);
    this.name = "CloudError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export function fail(status, code, publicMessage, internalMessage) {
  throw new CloudError(status, code, publicMessage, internalMessage);
}
