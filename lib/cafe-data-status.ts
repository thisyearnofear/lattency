export const CAFE_DATA_UNAVAILABLE =
  "Workspace data is temporarily unavailable. No demo data has been substituted.";

export class CafeDataUnavailableError extends Error {
  constructor() {
    super(CAFE_DATA_UNAVAILABLE);
    this.name = "CafeDataUnavailableError";
  }
}
