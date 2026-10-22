import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

async function generateOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('CareFlow Backend API')
    .setDescription(
      'CareFlow - Secure Medical Appointment & Encrypted Clinical Records with Tide QEA Multi-Admin Threshold Policy',
    )
    .setVersion('1.0.0')
    .addServer('http://localhost:3333', 'CareFlow Backend Local Server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'TideCloak JWT or DPoP bound Bearer token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'DPoP',
        in: 'header',
        description: 'RFC 9449 DPoP Proof Token (typ: dpop+jwt)',
      },
      'DPoP-header',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const docsDir = path.resolve(process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(docsDir, 'openapi.json'),
    JSON.stringify(document, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(docsDir, 'careflow-openapi.json'),
    JSON.stringify(document, null, 2),
    'utf8',
  );

  console.log('✅ Successfully generated docs/openapi.json and docs/careflow-openapi.json');
  await app.close();
}

generateOpenApi().catch((err) => {
  console.error('Failed to export OpenAPI:', err);
  process.exit(1);
});
