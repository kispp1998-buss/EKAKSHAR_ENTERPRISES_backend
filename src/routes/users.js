import express from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { auth, adminOnly } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { audit } from "../utils/audit.js";

const router = express.Router();
router.use(auth);

router.get(
  "/",
  adminOnly,
  asyncHandler(async (req, res) => {
    const users = await User.find().select("-passwordHash -refreshTokenHash").sort({ createdAt: -1 });
    res.json(users);
  })
);

router.post(
  "/",
  adminOnly,
  asyncHandler(async (req, res) => {
    const passwordHash = await bcrypt.hash(req.body.password || "ChangeMe@123", 10);
    const user = await User.create({
      name: req.body.name,
      email: req.body.email,
      role: req.body.role || "data_entry",
      passwordHash,
    });
    await audit(req, { action: "create", entity: "user", entityId: user._id });
    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
  })
);

router.patch(
  "/:id",
  adminOnly,
  asyncHandler(async (req, res) => {
    const data = { ...req.body };
    if (data.password) {
      data.passwordHash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }
    const user = await User.findByIdAndUpdate(req.params.id, data, { new: true }).select("-passwordHash -refreshTokenHash");
    res.json(user);
  })
);

router.get(
  "/audit",
  adminOnly,
  asyncHandler(async (req, res) => {
    const rows = await AuditLog.find().populate("user", "name email").sort({ createdAt: -1 }).limit(200);
    res.json(rows);
  })
);

export default router;
