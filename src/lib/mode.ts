export function payoutMode(): 'manual' | 'flip' {
  const mode = process.env.PAYOUT_MODE;
  if (mode && mode !== 'manual' && mode !== 'flip') throw Error('PAYOUT_MODE tidak valid.');
  if(mode==='manual'||mode==='flip')return mode;
  return ['sandbox', 'live'].includes(process.env.FLIP_MODE || '') ? 'flip' : 'manual';
}
export const uatMode = () => process.env.UAT_MODE === 'true';
