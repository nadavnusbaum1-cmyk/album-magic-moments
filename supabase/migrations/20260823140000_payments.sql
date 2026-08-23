-- Payments (Invoice4U clearing). One row per checkout attempt. The edge
-- functions (service role) own writes; users may read their own history.
--   kind            : 'plan' (buy/upgrade a plan) | 'extra_event' (one more event)
--   plan            : the tier purchased / priced against ('small' | 'wedding')
--   order_id        : our OrderIdClientUsage (unguessable UUID) — the callback's
--                     primary anti-spoof match key
--   status          : 'pending' -> 'paid' | 'failed'
--   payment_id      : Invoice4U PaymentId (kept for refunds / log lookup)
--   document_number : auto-issued tax invoice/receipt number
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  plan text,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NIS',
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'invoice4u',
  order_id text NOT NULL UNIQUE,
  payment_id text,
  document_number text,
  document_id text,
  raw_callback jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS payments_user_idx ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_order_idx ON public.payments(order_id);

-- Users see their own payments; the edge functions use the service role (which
-- bypasses RLS) for inserts/updates and callback fulfilment.
DROP POLICY IF EXISTS "Users read own payments" ON public.payments;
CREATE POLICY "Users read own payments" ON public.payments
  FOR SELECT TO authenticated USING (user_id = auth.uid());
