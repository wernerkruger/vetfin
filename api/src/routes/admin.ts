import { Router } from "express";
import { z } from "zod";
import { signAdminToken } from "../auth/jwt.js";
import { getConfig } from "../config.js";
import { verifyPassword } from "../crypto/password.js";
import { adminResetUserPassword, listAdminUsers } from "../db/admin.js";
import { HttpError } from "../errors.js";
import { getAdminAuth, requireAdminAuth } from "../middleware/requireAdmin.js";

const loginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const resetParams = z.object({
  type: z.enum(["borrower", "practice"]),
  id: z.string().uuid(),
});

export function adminRouter(): Router {
  const router = Router();

  router.post("/login", async (req, res, next) => {
    try {
      const config = getConfig();
      if (!config.adminPasswordHash) {
        throw new HttpError(503, "Admin access is not configured");
      }

      const { username, password } = loginBody.parse(req.body);
      if (username !== config.adminUsername) {
        throw new HttpError(401, "Invalid username or password");
      }

      const valid = await verifyPassword(password, config.adminPasswordHash);
      if (!valid) {
        throw new HttpError(401, "Invalid username or password");
      }

      const token = await signAdminToken(username);
      res.json({ token, username });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me", requireAdminAuth, (req, res) => {
    const auth = getAdminAuth(req);
    res.json({ username: auth.username });
  });

  router.get("/users", requireAdminAuth, (_req, res) => {
    res.json({ users: listAdminUsers() });
  });

  router.post(
    "/users/:type/:id/reset-password",
    requireAdminAuth,
    async (req, res, next) => {
      try {
        const params = resetParams.parse(req.params);
        const result = await adminResetUserPassword(params.type, params.id);
        res.json({
          message:
            "Temporary password created. Share it with the user securely; they must change it on next login.",
          temporaryPassword: result.temporaryPassword,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
