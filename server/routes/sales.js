const express = require("express");
const prisma = require("../db/prisma");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// Generate receipt number
async function generateReceiptNumber(shopId) {
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const last = await prisma.sale.findFirst({
    where: {
      shopId: shopId,
      receiptNumber: { startsWith: `TS-${today}` },
    },
    orderBy: { id: "desc" },
  });

  let num = 1;
  if (last && last.receiptNumber) {
    const parts = last.receiptNumber.split("-");
    if (parts.length >= 3) {
      num = parseInt(parts[2]) + 1;
    }
  }
  return `TS-${today}-${String(num).padStart(4, "0")}`;
}

// POST /api/sales - Create a new sale
router.post("/", async (req, res) => {
  const shopId = req.user.shop_id;
  try {
    const {
      items: saleItems,
      customer_name,
      customer_phone,
      payment_type,
      notes,
    } = req.body;

    if (!saleItems || saleItems.length === 0) {
      return res.status(400).json({ error: "At least one item is required." });
    }

    if (
      !payment_type ||
      !["cash", "credit", "mpesa", "sacco"].includes(payment_type)
    ) {
      return res
        .status(400)
        .json({ error: "Payment type must be cash, credit, mpesa, or sacco." });
    }

    const receiptNumber = await generateReceiptNumber(shopId);

    // Perform everything in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate stock and prepare data
      let totalAmount = 0;
      const processedItems = [];

      for (const si of saleItems) {
        const item = await tx.item.findFirst({
          where: { id: si.item_id, shopId: shopId },
        });

        if (!item) throw new Error(`Item not found: ${si.item_id}`);
        if (item.quantity < si.quantity) {
          throw new Error(
            `Insufficient stock for "${item.name}". Available: ${item.quantity}, Requested: ${si.quantity}`,
          );
        }

        const unitPrice = parseFloat(si.unit_price || item.sellingPrice);
        const subtotal = unitPrice * si.quantity;
        totalAmount += subtotal;

        processedItems.push({
          itemId: item.id,
          itemName: item.name,
          quantity: si.quantity,
          unitPrice: unitPrice,
          buyingPrice: parseFloat(item.buyingPrice),
          subtotal: subtotal,
        });
      }

      // 2. Handle Customer
      let customerId = null;
      if (customer_name) {
        let customer = await tx.customer.findFirst({
          where: {
            shopId: shopId,
            OR: [
              { name: { equals: customer_name, mode: "insensitive" } },
              { phone: customer_phone || undefined },
            ],
          },
        });

        if (customer) {
          customerId = customer.id;
          if (customer_phone && customer.phone !== customer_phone) {
            await tx.customer.update({
              where: { id: customer.id },
              data: { phone: customer_phone },
            });
          }
        } else {
          const newCustomer = await tx.customer.create({
            data: {
              shopId,
              name: customer_name,
              phone: customer_phone || "",
            },
          });
          customerId = newCustomer.id;
        }
      }

      // 3. Create Sale
      const sale = await tx.sale.create({
        data: {
          shopId,
          receiptNumber,
          customerId,
          customerName: customer_name || "Walk-in Customer",
          customerPhone: customer_phone || "",
          totalAmount: totalAmount,
          paymentType: payment_type,
          notes: notes || "",
          status: "completed",
        },
      });

      // 4. Create Sale Items & Update Stock
      for (const li of processedItems) {
        await tx.saleItem.create({
          data: {
            shopId,
            saleId: sale.id,
            itemId: li.itemId,
            itemName: li.itemName,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            buyingPrice: li.buyingPrice,
            subtotal: li.subtotal,
          },
        });

        // Update stock
        const updatedItem = await tx.item.update({
          where: { id: li.itemId },
          data: { quantity: { decrement: li.quantity } },
        });

        // Log movement
        await tx.stockMovement.create({
          data: {
            shopId,
            itemId: li.itemId,
            itemName: li.itemName,
            movementType: "OUT",
            quantity: li.quantity,
            balanceAfter: updatedItem.quantity,
            referenceType: "sale",
            referenceId: sale.id,
            notes: `Sale - ${receiptNumber}`,
          },
        });

        // Accounting: COGS
        const cogsAmount = li.buyingPrice * li.quantity;
        await tx.generalLedger.createMany({
          data: [
            {
              shopId,
              accountName: "Cost of Goods Sold",
              accountType: "Expense",
              debit: cogsAmount,
              credit: 0,
              referenceType: "sale",
              referenceId: sale.id,
              description: `COGS for ${li.itemName} (Receipt: ${receiptNumber})`,
            },
            {
              shopId,
              accountName: "Inventory",
              accountType: "Asset",
              debit: 0,
              credit: cogsAmount,
              referenceType: "sale",
              referenceId: sale.id,
              description: `COGS for ${li.itemName} (Receipt: ${receiptNumber})`,
            },
          ],
        });
      }

      // 5. Accounting: Revenue
      const paymentAccount =
        payment_type === "cash" ? "Cash"
        : payment_type === "mpesa" ? "Mpesa"
        : payment_type === "sacco" ? "Sacco"
        : "Accounts Receivable";

      await tx.generalLedger.createMany({
        data: [
          {
            shopId,
            accountName: paymentAccount,
            accountType: "Asset",
            debit: totalAmount,
            credit: 0,
            referenceType: "sale",
            referenceId: sale.id,
            description: `Sale Revenue (Receipt: ${receiptNumber}, Method: ${payment_type})`,
          },
          {
            shopId,
            accountName: "Sales Revenue",
            accountType: "Revenue",
            debit: 0,
            credit: totalAmount,
            referenceType: "sale",
            referenceId: sale.id,
            description: `Sale Revenue (Receipt: ${receiptNumber}, Method: ${payment_type})`,
          },
        ],
      });

      // 6. Handle Credit
      if (payment_type === "credit" && customerId) {
        await tx.creditLedger.create({
          data: {
            shopId,
            customerId,
            customerName: customer_name,
            saleId: sale.id,
            amount: totalAmount,
            balance: totalAmount,
            status: "unpaid",
          },
        });

        await tx.customer.update({
          where: { id: customerId },
          data: { totalCredit: { increment: totalAmount } },
        });
      }

      return { sale, receiptNumber };
    });

    const fullSale = await prisma.sale.findUnique({
      where: { id: result.sale.id },
      include: { saleItems: true },
    });

    res.status(201).json({
      sale: { ...fullSale, total_amount: parseFloat(fullSale.totalAmount) },
      items: fullSale.saleItems.map((i) => ({
        ...i,
        unit_price: parseFloat(i.unitPrice),
        subtotal: parseFloat(i.subtotal),
      })),
      receipt_number: result.receiptNumber,
    });
  } catch (err) {
    console.error("Sale creation error:", err);
    res.status(400).json({ error: err.message || "Failed to process sale." });
  }
});

// GET /api/sales
router.get("/", async (req, res) => {
  try {
    const { from, to, payment_type, status } = req.query;
    const shopId = req.user.shop_id;

    const where = { shopId: shopId };

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    if (payment_type) where.paymentType = payment_type;
    if (status) where.status = status;

    const sales = await prisma.sale.findMany({
      where,
      include: {
        _count: {
          select: { saleItems: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      sales.map((s) => ({
        ...s,
        total_amount: parseFloat(s.totalAmount),
        item_count: s._count.saleItems,
      })),
    );
  } catch (err) {
    console.error("Sales fetch error:", err);
    res.status(500).json({ error: "Failed to fetch sales." });
  }
});

// GET /api/sales/:id
router.get("/:id", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const sale = await prisma.sale.findFirst({
      where: { id: parseInt(req.params.id), shopId: shopId },
      include: { saleItems: true },
    });

    if (!sale) return res.status(404).json({ error: "Sale not found." });

    res.json({
      sale: { ...sale, total_amount: parseFloat(sale.totalAmount) },
      items: sale.saleItems.map((i) => ({
        ...i,
        unit_price: parseFloat(i.unitPrice),
        subtotal: parseFloat(i.subtotal),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sale." });
  }
});

// DELETE /api/sales/:id - Void a sale (restore stock)
router.delete("/:id", async (req, res) => {
  const shopId = req.user.shop_id;
  const saleId = parseInt(req.params.id);

  try {
    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, shopId: shopId },
        include: { saleItems: true },
      });

      if (!sale) throw new Error("Sale not found.");
      if (sale.status === "voided") throw new Error("Sale already voided.");

      // 1. Restore stock
      for (const si of sale.saleItems) {
        const updatedItem = await tx.item.update({
          where: { id: si.itemId },
          data: { quantity: { increment: si.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            shopId,
            itemId: si.itemId,
            itemName: si.itemName,
            movementType: "RETURN",
            quantity: si.quantity,
            balanceAfter: updatedItem.quantity,
            referenceType: "delete_sale",
            referenceId: sale.id,
            notes: `Voided sale - ${sale.receiptNumber}`,
          },
        });

        // Reverse COGS
        const cogsAmount = parseFloat(si.buyingPrice) * si.quantity;
        await tx.generalLedger.createMany({
          data: [
            {
              shopId,
              accountName: "Inventory",
              accountType: "Asset",
              debit: cogsAmount,
              credit: 0,
              referenceType: "void",
              referenceId: sale.id,
              description: `Stock Restored from Void (Item: ${si.itemName})`,
            },
            {
              shopId,
              accountName: "Cost of Goods Sold",
              accountType: "Expense",
              debit: 0,
              credit: cogsAmount,
              referenceType: "void",
              referenceId: sale.id,
              description: `Stock Restored from Void (Item: ${si.itemName})`,
            },
          ],
        });
      }

      // 2. Reverse Revenue
      const paymentAccount =
        sale.paymentType === "cash" ? "Cash"
        : sale.paymentType === "mpesa" ? "Mpesa"
        : sale.paymentType === "sacco" ? "Sacco"
        : "Accounts Receivable";

      await tx.generalLedger.createMany({
        data: [
          {
            shopId,
            accountName: "Sales Revenue",
            accountType: "Revenue",
            debit: sale.totalAmount,
            credit: 0,
            referenceType: "void",
            referenceId: sale.id,
            description: `Sale Voided (Receipt: ${sale.receiptNumber})`,
          },
          {
            shopId,
            accountName: paymentAccount,
            accountType: "Asset",
            debit: 0,
            credit: sale.totalAmount,
            referenceType: "void",
            referenceId: sale.id,
            description: `Sale Voided (Receipt: ${sale.receiptNumber})`,
          },
        ],
      });

      // 3. Handle Credit Reversal
      if (sale.paymentType === "credit" && sale.customerId) {
        const creditEntry = await tx.creditLedger.findFirst({
          where: { saleId: sale.id, shopId: shopId },
        });

        if (creditEntry) {
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { totalCredit: { decrement: creditEntry.amount } },
          });

          await tx.creditLedger.update({
            where: { id: creditEntry.id },
            data: { status: "voided" },
          });
        }
      }

      // 4. Mark sale as voided
      await tx.sale.update({
        where: { id: saleId },
        data: { status: "voided" },
      });
    });

    res.json({
      message:
        "Sale voided successfully. Audit trail and reversing entries recorded.",
    });
  } catch (err) {
    console.error("Sale void error:", err);
    res.status(400).json({ error: err.message || "Failed to void sale." });
  }
});

module.exports = router;
