import { config } from 'dotenv';
config();
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  await app.listen(AppModule.port);
  console.log(`Server running on port ${AppModule.port}`);
}
bootstrap();
