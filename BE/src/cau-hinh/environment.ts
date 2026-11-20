export type Environment = Record<string, string | undefined>;

export function validateEnvironment(config: Environment): Environment {
  const port = config.PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new Error('PORT must be a positive integer.');
  }
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }
  if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.');
  }
  if (config.COOKIE_SECURE && !['true', 'false'].includes(config.COOKIE_SECURE)) {
    throw new Error('COOKIE_SECURE must be true or false when set.');
  }
  if (config.VIETQR_CALLBACK_TOKEN_SECRET && config.VIETQR_CALLBACK_TOKEN_SECRET.length < 32) {
    throw new Error('VIETQR_CALLBACK_TOKEN_SECRET must be at least 32 characters when set.');
  }
  const vietQrKeys = [
    'VIETQR_API_USERNAME',
    'VIETQR_API_PASSWORD',
    'VIETQR_BANK_CODE',
    'VIETQR_BANK_ACCOUNT',
    'VIETQR_ACCOUNT_NAME',
    'VIETQR_CALLBACK_USERNAME',
    'VIETQR_CALLBACK_PASSWORD',
    'VIETQR_CALLBACK_TOKEN_SECRET',
  ];
  if (config.VIETQR_ENABLED && !['true', 'false'].includes(config.VIETQR_ENABLED))
    throw new Error('VIETQR_ENABLED must be true or false when set.');
  if (config.VIETQR_ENABLED === 'true' && vietQrKeys.some((key) => !config[key]?.trim()))
    throw new Error('VietQR must be configured with every required VIETQR_* credential.');
  if (config.TRUST_PROXY && !/^(true|false|\d+)$/.test(config.TRUST_PROXY))
    throw new Error('TRUST_PROXY must be true, false, or a non-negative proxy hop count.');
  return config;
}
