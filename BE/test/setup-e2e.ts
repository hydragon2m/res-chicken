process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.JWT_SECRET ??= 'test-jwt-secret-that-is-longer-than-32-chars';
