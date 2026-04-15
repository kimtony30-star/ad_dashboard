import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  isPublicMode: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // public_mode 쿠키가 있으면 익명화 강제 모드
  const cookieHeader = opts.req.headers.cookie ?? "";
  const isPublicMode = cookieHeader.split(";").some((c) =>
    c.trim().startsWith("public_mode=")
  );

  return {
    req: opts.req,
    res: opts.res,
    user,
    isPublicMode,
  };
}
