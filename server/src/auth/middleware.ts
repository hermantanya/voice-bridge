import type { NextFunction, Request, Response } from "express";

import { getAuthJwtSecret, verifyAuthToken } from "./jwt.js";
import { getUserStore } from "../users/userStore.js";
import type { UserRecord } from "../users/profileTypes.js";

export type AuthedRequest = Request & {
  authUser?: UserRecord;
};

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const verified = verifyAuthToken(token, getAuthJwtSecret());
  if (!verified.ok) {
    res.status(401).json({ error: verified.error });
    return;
  }

  const user = await getUserStore().findById(verified.payload.sub);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  req.authUser = user;
  next();
}
