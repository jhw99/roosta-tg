import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { KyeCard } from '../components/KyeCard';
import { en } from '../i18n/en';
import type { ApiKye } from '../lib/api';
import type { KyeStatus } from '@roosta/shared';

function makeKye(status: KyeStatus): ApiKye {
  return {
    id: `kye-${status}`,
    contractAddress: 'EQabc',
    organizerId: 'u1',
    organizerHandle: 'org',
    organizerWallet: 'EQowner',
    name: `Test ${status}`,
    params: {
      N: 5,
      contribution: (100n * 1_000_000n).toString(),
      roundIntervalSec: 7 * 86400,
      feeRateBps: 300,
      alphaMaxBps: 500,
      defaultPolicy: 'pro_rata',
    },
    status,
    memberCount: 3,
    currentRound: 1,
    nextRoundAt: Math.floor(Date.now() / 1000) + 3600,
    createdAt: 0,
  };
}

describe('KyeCard', () => {
  const cases: Array<[KyeStatus, string]> = [
    ['created', en.status.created],
    ['active', en.status.active],
    ['completed', en.status.completed],
    ['cancelled', en.status.cancelled],
  ];

  for (const [status, label] of cases) {
    it(`renders ${status} badge with label "${label}"`, () => {
      const { container, getByText } = render(<KyeCard kye={makeKye(status)} strings={en} />);
      const card = container.querySelector('[data-testid="kye-card"]');
      expect(card?.getAttribute('data-status')).toBe(status);
      const badge = container.querySelector(`[data-status="${status}"]`);
      expect(badge).not.toBeNull();
      expect(getByText(label)).toBeTruthy();
    });
  }
});
