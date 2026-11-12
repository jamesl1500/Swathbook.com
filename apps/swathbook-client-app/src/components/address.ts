import type { BookingAddress } from '@/data/types';

/** "1 Elm St, Apt 2, Austin, TX 78701" */
export function formatAddress(address: BookingAddress) {
  const regionLine = [address.region, address.postal_code].filter(Boolean).join(' ');
  return [address.line1, address.line2, address.city, regionLine].filter(Boolean).join(', ');
}
