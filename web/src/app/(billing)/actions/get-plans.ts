"use server";

import { plansRepo } from "@/db/repositories/billing-repo";

export async function getSubscriptionPlans() {
  return plansRepo.findAll();
}
