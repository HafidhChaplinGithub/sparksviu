export function payoutMode(): 'manual' | 'flip' {
  const mode = process.env.PAYOUT_MODE;
  if (mode && mode !== 'manual' && mode !== 'flip') throw Error('PAYOUT_MODE tidak valid.');
  if(mode==='manual'||mode==='flip')return mode;
  return ['sandbox', 'live'].includes(process.env.FLIP_MODE || '') ? 'flip' : 'manual';
}
export const uatMode = () => process.env.UAT_MODE === 'true';

export function demoPasswordOnlyEnabled() {
  return process.env.UAT_PASSWORD_ONLY === 'true' && uatMode() &&
    process.env.PAYOUT_MODE === 'manual' && process.env.FLIP_MODE === 'disabled' &&
    process.env.REGISTRATION_ENABLED !== 'true' && !process.env.SMTP_HOST;
}

export function demoPasswordOnlyFor(user: { is_demo?: boolean; access_expires_at?: string | Date | null }) {
  const expires = user.access_expires_at ? new Date(user.access_expires_at).getTime() : NaN;
  return demoPasswordOnlyEnabled() && user.is_demo === true && Number.isFinite(expires) && expires > Date.now();
}
