// Vitest setup: register @ton/test-utils matchers (originally Jest/Chai only).
import { expect } from 'vitest';
import {
  compareTransaction,
  flattenTransaction,
} from '@ton/test-utils';

function wrap(comparer: (a: any, b: any) => boolean) {
  return function (received: any, expected: any) {
    // received may be transactions array; emulate jest matcher signature.
    let pass = false;
    if (Array.isArray(received)) {
      pass = received.some((tx) => compareTransaction(flattenTransaction(tx), expected));
    } else {
      pass = compareTransaction(flattenTransaction(received), expected);
    }
    return {
      pass,
      message: () =>
        pass
          ? `Expected no transaction matching ${JSON.stringify(expected, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`
          : `Expected a transaction matching ${JSON.stringify(expected, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
    };
  };
}

expect.extend({
  toHaveTransaction: wrap((a: any, b: any) => compareTransaction(a, b)) as any,
});
