import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { env } from "../config/env.js";
import { signAccess, signRefresh, auth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";

const router = express.Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || "").toLowerCase().trim() });
    if (!user || !user.active) return res.status(401).json({ message: "Invalid email or password" });
    const ok = await bcrypt.compare(password || "", user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid email or password" });
    const accessToken = signAccess(user);
    const refreshToken = signRefresh(user);
    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await user.save();
    res.json({
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });
    const payload = jwt.verify(refreshToken, env.jwtRefreshSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.active || !user.refreshTokenHash) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    const match = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!match) return res.status(401).json({ message: "Invalid refresh token" });
    res.json({ accessToken: signAccess(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  })
);

router.post(
  "/logout",
  auth,
  asyncHandler(async (req, res) => {
    req.user.refreshTokenHash = null;
    await req.user.save();
    res.json({ ok: true });
  })
);

router.get(
  "/me",
  auth,
  asyncHandler(async (req, res) => {
    res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role });
  })
);

export default router;
