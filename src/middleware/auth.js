import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/User.js";

export function signAccess(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpires,
  });
}

export function signRefresh(user) {
  return jwt.sign({ sub: user._id.toString(), typ: "refresh" }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpires,
  });
}

export async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Authentication required" });
    const payload = jwt.verify(token, env.jwtAccessSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) return res.status(401).json({ message: "Invalid session" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Authentication required" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission for this action" });
    }
    next();
  };
}

export const canWrite = allow("admin", "data_entry");
export const adminOnly = allow("admin");
