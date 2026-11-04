import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "data_entry", "viewer"], default: "data_entry" },
    active: { type: Boolean, default: true },
    refreshTokenHash: { type: String, default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
