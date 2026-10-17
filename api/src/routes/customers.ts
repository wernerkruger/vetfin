import { Router } from "express";
import { z } from "zod";
import {
  getCustomerById,
  getCustomerProfile,
  toPublicCustomer,
  upsertCustomer,
} from "../db/store.js";

const createBody = z.object({
  clientUserId: z.string().min(1),
  email: z.string().email().optional(),
});

export function customersRouter(): Router {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const body = createBody.parse(req.body);
      const customer = await upsertCustomer(body);
      res.status(201).json({ customer: toPublicCustomer(customer) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:customerId", async (req, res, next) => {
    try {
      const profile = await getCustomerProfile(req.params.customerId);
      if (!profile) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }
      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export async function requireCustomer(customerId: string) {
  const customer = await getCustomerById(customerId);
  if (!customer) {
    const error = new Error("Customer not found");
    (error as Error & { status: number }).status = 404;
    throw error;
  }
  return customer;
}
