import { Router } from "express";

import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { validateProfilePatch } from "../users/profileTypes.js";
import { getUserStore } from "../users/userStore.js";

export const profileRouter = Router();

profileRouter.get("/", requireAuth, (req: AuthedRequest, res) => {
  const user = req.authUser!;
  res.json({
    id: user.id,
    email: user.email,
    profile: user.profile,
  });
});

profileRouter.patch("/", requireAuth, async (req: AuthedRequest, res) => {
  const validated = validateProfilePatch(req.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const updated = await getUserStore().updateProfile(
    req.authUser!.id,
    validated.patch,
  );

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: updated.id,
    email: updated.email,
    profile: updated.profile,
  });
});
