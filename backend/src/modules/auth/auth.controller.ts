import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "./auth.service.js";
import { authRepo } from "./auth.repo.js";
import { loginSchema, refreshSchema } from "./auth.schema.js";
import { authGuard } from "../../middleware/auth-guard.js";

export async function authController(app: FastifyInstance) {
  const signAccess = (payload: object) =>
    app.jwt.sign(payload as { sub: number; email: string }, { expiresIn: "15m" });
  const service = new AuthService(authRepo, signAccess);

  // POST /auth/login
  app.post("/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(req.body);
    const result = await service.login(body.email, body.password);
    return reply.code(200).send(result);
  });

  // POST /auth/refresh
  app.post("/refresh", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = refreshSchema.parse(req.body);
    const result = await service.refresh(body.refreshToken);
    return reply.code(200).send(result);
  });

  // POST /auth/logout  (guarded)
  app.post(
    "/logout",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = req.user as { sub: number; email: string };
      await service.logout(user.sub);
      return reply.code(200).send({ message: "Logged out" });
    },
  );

  // GET /auth/me  (guarded)
  app.get(
    "/me",
    { preHandler: authGuard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = req.user as { sub: number; email: string };
      const profile = await service.me(user.sub);
      if (!profile) {
        const e: any = new Error("User not found");
        e.statusCode = 404;
        throw e;
      }
      return reply.code(200).send(profile);
    },
  );
}
