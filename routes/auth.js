const express = require("express");
const prisma = require("../prisma/client");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

router.get("/test", (req, res) =>
  res.json({ message: "Auth routes are reachable" }),
);

// GET /api/auth/me
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        fullName: true,
        shopName: true,
        shopId: true,
        phone: true,
        role: true,
      },
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;
