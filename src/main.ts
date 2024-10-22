import { config } from 'dotenv';
config();
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true } );
  app.useGlobalPipes(new ValidationPipe());
  app.useLogger(['error', 'warn', 'log', 'debug', 'verbose']);
  await app.listen(AppModule.port);
  console.log(`Server running on port ${AppModule.port}`);
}
bootstrap();
