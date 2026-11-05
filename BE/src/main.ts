import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy && trustProxy !== 'false') {
    app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', trustProxy === 'true' ? true : Number(trustProxy));
  }
  app.enableCors({ origin: process.env.WEB_URL ?? 'http://localhost:3000', credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
