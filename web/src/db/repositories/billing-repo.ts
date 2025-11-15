import { db, subscriptionPlans } from "@/db";
import { makeRepo } from "../helpers/repo";

const subscriptionPlansRepoFactory = makeRepo(subscriptionPlans, (base) => {
    return {
        ...base,
    }
}, { primaryKey: "id" });

export const plansRepo = subscriptionPlansRepoFactory.with(db);
export const usePlansRepo = subscriptionPlansRepoFactory.with;
