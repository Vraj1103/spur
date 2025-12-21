import { Router, Request, Response } from "express";

const router = Router();

// Basic ping endpoint
router.get("/ping", (req: Request, res: Response) => {
  res.send("pong");
});

// Health check endpoint
router.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
