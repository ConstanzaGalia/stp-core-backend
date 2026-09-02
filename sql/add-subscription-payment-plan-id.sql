-- Asegura el FK de plan en la suscripción (ya suele existir como paymentPlanId).
ALTER TABLE user_payment_subscriptions
  ADD COLUMN IF NOT EXISTS "paymentPlanId" uuid;
