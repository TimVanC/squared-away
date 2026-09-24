import { NextResponse } from "next/server";
import { UnauthorizedError, requireUserId } from "./auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Wrap an API handler: resolves the logged-in user id, maps thrown errors to JSON responses.
 * Every data route goes through this so nothing runs without a user id.
 */
export function withUser<T extends unknown[]>(
  handler: (userId: number, req: Request, ...rest: T) => Promise<Response>,
) {
  return async (req: Request, ...rest: T): Promise<Response> => {
    try {
      const userId = await requireUserId();
      return await handler(userId, req, ...rest);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
