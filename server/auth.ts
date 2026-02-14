import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { getPool, isDatabaseAvailable } from "./db";
import { storage } from "./storage";

// Extend express session types
declare module "express-session" {
  interface SessionData {
    passport: { user: string };
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string | null;
      orgId: string | null;
      role: string;
    }
  }
}

/**
 * Check if authentication is required based on environment configuration.
 */
export function isAuthRequired(): boolean {
  return process.env.REQUIRE_AUTH === "true";
}

/**
 * Find or create a user from OAuth profile data.
 * Creates a default organization for the first user from each OAuth provider.
 */
async function findOrCreateOAuthUser(
  provider: string,
  providerId: string,
  email: string,
  name: string | null,
  accessToken: string | null,
  refreshToken: string | null
): Promise<Express.User> {
  // Look up existing OAuth account
  const existingOauth = await storage.getOauthAccount(provider, providerId);

  if (existingOauth) {
    // Update tokens if changed
    if (accessToken !== existingOauth.accessToken || refreshToken !== existingOauth.refreshToken) {
      await storage.updateOauthTokens(existingOauth.id, accessToken, refreshToken);
    }
    const user = await storage.getUser(existingOauth.userId);
    if (user) {
      return { id: user.id, email: user.email, name: user.name, orgId: user.orgId, role: user.role };
    }
  }

  // Check if user exists by email (may have signed in with different provider)
  let user = await storage.getUserByEmail(email);

  if (!user) {
    // Create default org for new user
    const org = await storage.createOrganization({
      name: `${name || email.split("@")[0]}'s Organization`,
    });

    // Create user
    user = await storage.createUser({
      email,
      name,
      orgId: org.id,
      role: "admin", // First user in org is admin
    });

    // Initialize user progress
    await storage.createUserProgress({ userId: user.id });
  }

  // Link OAuth account to user
  await storage.createOauthAccount({
    userId: user.id,
    provider,
    providerId,
    accessToken,
    refreshToken,
  });

  return { id: user.id, email: user.email, name: user.name, orgId: user.orgId, role: user.role };
}

/**
 * Configure passport serialization/deserialization.
 */
function configurePassport() {
  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (user) {
        done(null, { id: user.id, email: user.email, name: user.name, orgId: user.orgId, role: user.role });
      } else {
        done(null, false);
      }
    } catch (err) {
      done(err);
    }
  });

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
          scope: ["profile", "email"],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error("No email found in Google profile"));
            }
            const user = await findOrCreateOAuthUser(
              "google",
              profile.id,
              email,
              profile.displayName || null,
              _accessToken,
              _refreshToken ?? null
            );
            done(null, user);
          } catch (err) {
            done(err as Error);
          }
        }
      )
    );
    console.log("Google OAuth strategy configured");
  }

  // GitHub OAuth Strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: process.env.GITHUB_CALLBACK_URL || "/auth/github/callback",
          scope: ["user:email"],
        },
        async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error("No email found in GitHub profile. Make sure your email is public or grant user:email scope."));
            }
            const user = await findOrCreateOAuthUser(
              "github",
              profile.id,
              email,
              profile.displayName || profile.username || null,
              _accessToken,
              _refreshToken ?? null
            );
            done(null, user);
          } catch (err) {
            done(err as Error);
          }
        }
      )
    );
    console.log("GitHub OAuth strategy configured");
  }
}

/**
 * Set up session and passport middleware on the Express app.
 * Must be called BEFORE registering routes.
 */
export function setupAuth(app: Express): void {
  if (!isDatabaseAvailable()) {
    console.warn("DATABASE_URL not set - authentication disabled");
    return;
  }

  const PgSession = connectPgSimple(session);

  const sessionMiddleware = session({
    store: new PgSession({
      pool: getPool() as any,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
    },
  });

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  configurePassport();

  // Export session middleware for WebSocket upgrade parsing
  app.set("sessionMiddleware", sessionMiddleware);
}

/**
 * Middleware: require authentication. Returns 401 if not authenticated.
 * When REQUIRE_AUTH is false, this middleware is a no-op.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!isAuthRequired()) {
    return next();
  }
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
};

/**
 * Verify whether the provided admin secret matches the configured ADMIN_SECRET.
 * Returns false if ADMIN_SECRET is not configured.
 */
export function verifyAdminSecret(secret: string): boolean {
  const configured = process.env.ADMIN_SECRET;
  if (!configured) return false;
  return secret === configured;
}

/**
 * Middleware: require admin role. Returns 403 if not admin.
 *
 * When REQUIRE_AUTH is false, also accepts a valid `x-admin-secret` header
 * so the admin console is accessible in demo/no-auth mode via a shared secret.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  // When auth is disabled, check for admin secret header
  if (!isAuthRequired()) {
    const secret = req.headers["x-admin-secret"] as string | undefined;
    if (secret && verifyAdminSecret(secret)) {
      return next();
    }
    // Also allow if no ADMIN_SECRET is configured (fully open dev mode)
    if (!process.env.ADMIN_SECRET) {
      return next();
    }
    return res.status(403).json({ error: "Admin secret required" });
  }
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

/**
 * Parse session from an HTTP upgrade request (for WebSocket auth).
 * Returns the user ID if authenticated, null otherwise.
 */
export function parseSessionFromUpgrade(
  req: any,
  sessionMiddleware: RequestHandler
): Promise<string | null> {
  return new Promise((resolve) => {
    const res = { end: () => {} } as any;
    sessionMiddleware(req, res, () => {
      const userId = req.session?.passport?.user;
      resolve(userId || null);
    });
  });
}
