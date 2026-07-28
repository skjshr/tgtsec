export class LabError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "LabError";
    this.code = code;
    this.status = status;
  }
}

export function asPublicError(error) {
  if (error instanceof LabError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "ラボ状態を処理できませんでした。",
      },
    },
  };
}
