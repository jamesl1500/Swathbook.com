import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

import { businessKey } from './api';

/** Several changes at once (e.g. a paid deposit) refresh once. */
const BURST_MS = 500;

/**
 * Keeps the open business live: whenever someone else changes one of its
 * jobs (a new booking, a payment, a cancellation request…), Supabase Realtime
 * says so and every list, count, job and the notification feed refresh.
 * Realtime applies the same RLS as everything else; crew only hear about
 * what they can see.
 */
export function useLiveBusiness(businessId: string | undefined, userId: string | undefined) {
  const client = useQueryClient();

  useEffect(() => {
    if (!businessId || !userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`business:${businessId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_events', filter: `business_id=eq.${businessId}` }, (payload) => {
        // Your own changes already refreshed the screen you made them on.
        if ((payload.new as { actor_id?: string | null }).actor_id === userId) return;
        clearTimeout(timer);
        timer = setTimeout(() => void client.invalidateQueries({ queryKey: businessKey(businessId) }), BURST_MS);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [client, businessId, userId]);
}
