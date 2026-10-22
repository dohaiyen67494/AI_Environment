import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const logger = new Logger('CareFlowBootstrap');
  const app = await NestFactory.create(AppModule);

  // Invariant Constraint 1: API port 3333
  const port = process.env.PORT || 3333;

  // Global prefix: /v1 (optional or root)
  // Let's enable CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter for Prisma errors (P2002 -> 409 Conflict)
  app.useGlobalFilters(new PrismaExceptionFilter());

  // Swagger OpenAPI Documentation at /api/docs
  const config = new DocumentBuilder()
    .setTitle('CareFlow Backend API')
    .setDescription(
      'CareFlow - Secure Medical Appointment & Encrypted Clinical Records with Tide QEA Multi-Admin Threshold Policy',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your TideCloak JWT or DPoP access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`🚀 CareFlow Backend running on: http://localhost:${port}`);
  logger.log(`📑 OpenAPI / Swagger Docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();
