// Issues a one-time owner setup code (valid 7 days) for a branch that has no owner yet.
// Give the code to the restaurant owner; they open /setup and create their own login.
//   npm run setup:code
import { getDb } from "../db/client";
import { config } from "../server/config";
import { issueSetupCode } from "../server/onboarding";

issueSetupCode({ db: getDb(), branchId: config.branchId() })
  .then((code) => {
    console.log(`Owner setup code (valid 7 days, single use):\n\n  ${code}\n\nThe owner opens <app URL>/setup and enters it.`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
