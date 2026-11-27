import { config } from 'dotenv';
config();
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

function getAllowedOrigins(): string[] {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const origins: string[] = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    frontendUrl,
  ];
  if (frontendUrl.includes('entrenamientostp.com')) {
    origins.push('https://www.entrenamientostp.com', 'https://entrenamientostp.com');
  }
  return [...new Set(origins)];
}

/**
 * Saltos de proxy confiables para leer la IP real del visitante (`req.ip`).
 * `TRUST_PROXY_HOPS` explícito gana; en Railway (un proxy delante) se asume 1.
 */
function resolveTrustProxyHops(): number | undefined {
  const raw = process.env.TRUST_PROXY_HOPS?.trim();
  if (raw) {
    const hops = Number(raw);
    return Number.isInteger(hops) && hops >= 0 ? hops : undefined;
  }
  return process.env.RAILWAY_ENVIRONMENT ? 1 : undefined;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const trustProxyHops = resolveTrustProxyHops();
  if (trustProxyHops !== undefined) {
    app.set('trust proxy', trustProxyHops);
  }
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true, // Habilita la transformación automática
    whitelist: true, // Elimina propiedades no definidas en el DTO
    forbidNonWhitelisted: true, // Rechaza requests con propiedades no permitidas
  }));
  app.useLogger(['error', 'warn', 'log', 'debug', 'verbose']);
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Server running on port ${port}`);
}
bootstrap();
