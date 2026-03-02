const express = require("express");
const prisma = require("../prisma/client");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// GET /api/customers
router.get("/", async (req, res) => {
  try {
    const { q } = req.query;
    const shopId = req.user.shop_id;

    const where = { shopId: shopId };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
    });

    res.json(
      customers.map((c) => ({
        ...c,
        total_credit: parseFloat(c.totalCredit),
      })),
    );
  } catch (err) {
    console.error("Fetch customers error:", err);
    res.status(500).json({ error: "Failed to fetch customers." });
  }
});

// GET /api/customers/:id
router.get("/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: parseInt(req.params.id), shopId: req.user.shop_id },
    });
    if (!customer)
      return res.status(404).json({ error: "Customer not found." });
    res.json({
      ...customer,
      total_credit: parseFloat(customer.totalCredit),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch customer." });
  }
});

// GET /api/customers/:id/ledger
router.get("/:id/ledger", async (req, res) => {
  try {
    const ledger = await prisma.creditLedger.findMany({
      where: {
        customerId: parseInt(req.params.id),
        shopId: req.user.shop_id,
      },
      include: {
        sale: { select: { receiptNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      ledger.map((l) => ({
        ...l,
        receipt_number: l.sale?.receiptNumber || "N/A",
        amount: parseFloat(l.amount),
        paid_amount: parseFloat(l.paidAmount),
        balance: parseFloat(l.balance),
      })),
    );
  } catch (err) {
    console.error("Fetch ledger error:", err);
    res.status(500).json({ error: "Failed to fetch credit ledger." });
  }
});

// POST /api/customers/:id/pay - Record credit payment
router.post("/:id/pay", async (req, res) => {
  const shopId = req.user.shop_id;
  const customerId = parseInt(req.params.id);

  try {
    const { amount, ledger_id, payment_date, notes } = req.body;
    const payDate = payment_date ? new Date(payment_date) : new Date();

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ error: "Payment amount must be greater than 0." });
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, shopId: shopId },
    });
    if (!customer)
      return res.status(404).json({ error: "Customer not found." });

    const result = await prisma.$transaction(async (tx) => {
      if (ledger_id) {
        const entry = await tx.creditLedger.findFirst({
          where: {
            id: parseInt(ledger_id),
            customerId: customerId,
            shopId: shopId,
          },
        });
        if (!entry) throw new Error("Credit entry not found.");

        const newPaid = parseFloat(entry.paidAmount) + parseFloat(amount);
        const newBalance = Math.max(0, parseFloat(entry.amount) - newPaid);
        const newStatus =
          newBalance <= 0 ? "paid"
          : newPaid > 0 ? "partial"
          : "unpaid";

        await tx.creditLedger.update({
          where: { id: entry.id },
          data: {
            paidAmount: newPaid,
            balance: newBalance,
            status: newStatus,
          },
        });

        await tx.creditPayment.create({
          data: {
            shopId,
            customerId,
            ledgerId: entry.id,
            amount: amount,
            paymentDate: payDate,
            notes: notes || "",
          },
        });
      } else {
        await tx.creditPayment.create({
          data: {
            shopId,
            customerId,
            amount: amount,
            paymentDate: payDate,
            notes: notes || "Partial payment",
          },
        });
      }

      // Update customer total credit
      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { totalCredit: { decrement: amount } },
      });

      // Accounting
      await tx.generalLedger.createMany({
        data: [
          {
            shopId,
            accountName: "Cash",
            accountType: "Asset",
            debit: amount,
            credit: 0,
            referenceType: "payment",
            referenceId: customerId,
            description: `Credit payment from ${customer.name}`,
          },
          {
            shopId,
            accountName: "Accounts Receivable",
            accountType: "Asset",
            debit: 0,
            credit: amount,
            referenceType: "payment",
            referenceId: customerId,
            description: `Credit payment from ${customer.name}`,
          },
        ],
      });

      return updatedCustomer;
    });

    res.json({
      message: "Payment recorded successfully.",
      customer: { ...result, total_credit: parseFloat(result.totalCredit) },
    });
  } catch (err) {
    console.error("Payment error:", err);
    res.status(400).json({ error: err.message || "Failed to record payment." });
  }
});

module.exports = router;
