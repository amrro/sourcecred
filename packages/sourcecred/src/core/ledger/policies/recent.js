// @flow

import * as G from "../grain";
import * as P from "../../../util/combo";
import {type CredGrainView} from "../../credGrainView";
import {type TimestampMs} from "../../../util/timestamp";
import {type GrainReceipt} from "../grainAllocation";
import {
  type NonnegativeGrain,
  grainParser,
  numberOrFloatStringParser,
} from "../nonnegativeGrain";

/**
 * The Recent policy distributes cred using a time discount factor, weighing
 * recent contributions higher. The policy takes a history of cred scores, progressively
 * discounting past cred scores, and then taking the sum over the discounted scores.
 *
 * A cred score at time t reads as follows: "The discounted cred c' at a timestep which is
 * n timesteps back from the most recent one is its cred score c multiplied by the discount
 * factor to the nth power."
 *
 * c' =  c * (1 - discount) ** n
 *
 * Discounts range from 0 to 1, with a higher discount weighing recent contribution
 * higher.
 *
 * Note that this is a generalization of the Immediate policy, where Immediate
 * is the same as Recent with a full discount, i.e. a discount factor 1 (100%).
 *
 */
export type Recent = "RECENT";

export type RecentPolicy = {|
  +policyType: Recent,
  +budget: NonnegativeGrain,
  +discount: Discount,
|};

/**
 * Split a grain budget based on exponentially weighted recent
 * cred.
 */
export function recentReceipts(
  policy: RecentPolicy,
  credGrainView: CredGrainView,
  effectiveTimestamp: TimestampMs
): $ReadOnlyArray<GrainReceipt> {
  const lookback = 0;

  const timeLimitedCredGrainView = credGrainView.withTimeScopeFromLookback(
    effectiveTimestamp,
    lookback
  );
  const timeLimitedParticipants = timeLimitedCredGrainView.activeParticipants();

  const computeDecayedCred = (i) => {
    return i.credPerInterval.reduce(
      (acc, cred) => acc * (1 - policy.discount) + cred,
      0
    );
  };
  const decayedCredPerIdentity = timeLimitedParticipants.map(
    computeDecayedCred
  );

  const amounts = G.splitBudget(policy.budget, decayedCredPerIdentity);

  return timeLimitedParticipants.map(({identity}, i) => ({
    id: identity.id,
    amount: amounts[i],
  }));
}

export const recentConfigParser: P.Parser<RecentPolicy> = P.object({
  policyType: P.exactly(["RECENT"]),
  budget: numberOrFloatStringParser,
  discount: P.fmap(P.number, toDiscount),
});

export const recentPolicyParser: P.Parser<RecentPolicy> = P.object({
  policyType: P.exactly(["RECENT"]),
  budget: grainParser,
  discount: P.fmap(P.number, toDiscount),
});

export opaque type Discount: number = number;
export function toDiscount(n: number): Discount {
  if (n < 0 || n > 1) {
    throw new Error(`Discount must be in range [0,1]`);
  }

  return n;
}

export function toString(policy: RecentPolicy): string {
  return [
    policy.policyType + " Policy",
    "Budget " + G.format(policy.budget, 3),
    "Discount: " + policy.discount,
  ].join(`\n`);
}
