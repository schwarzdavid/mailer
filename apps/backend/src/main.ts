import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {INestApplication, Logger, ValidationPipe} from "@nestjs/common";
import {DocumentBuilder, OpenAPIObject, SwaggerModule} from "@nestjs/swagger";
import {ConfigService} from "@nestjs/config";
import {dirname, join} from "node:path";
import * as fs from "node:fs/promises";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    transformOptions: {
      excludeExtraneousValues: true,
    },
  }))

  const specOnly = process.argv.some(arg => arg === '--spec-only')
  const document = setupOpenAPI(app)
  const logger = new Logger('Bootstrap')

  if(specOnly || process.env.NODE_ENV === 'development') {
    await saveOpenApiSpec(app, document)
    logger.log('OpenAPI spec saved.')
  }

  if(specOnly) {
    logger.log('Closing application')
    await app.close()
    logger.log('Application closed')
  } else {
    SwaggerModule.setup('docs', app, document)
    await app.listen(process.env.PORT ?? 8000);
    logger.log(`Application is running on: ${await app.getUrl()}`);
  }
}

function setupOpenAPI(app: INestApplication): OpenAPIObject {
  const openApiConfig = new DocumentBuilder()
      .setTitle('schwarzdavid Mailer')
      .setDescription('Simple Mail SaaS')
      .setVersion(process.env.npm_package_version ?? '0.0.0')
      .addBearerAuth()
      .addApiKey({
        type: 'apiKey',
        name: 'key',
        in: 'query'
      })
      .addServer('http://localhost:8000', 'Dev Server')
      .addServer('https://schwarzdavid.email', 'Production Server')
      .setContact('David Schwarz', 'https://schwarzdavid.at', 'hi@schwarzdavid.at')
      .build()

  return SwaggerModule.createDocument(app, openApiConfig, {
    operationIdFactory: (_, methodKey) => methodKey
  })
}

async function saveOpenApiSpec(app: INestApplication, document: OpenAPIObject) {
  const configService = app.get(ConfigService)
  const outputPath = configService.get<string>('OPENAPI_PATH', join(__dirname, '../../../packages/api/assets/openapi.json'))

  await fs.mkdir(dirname(outputPath), {recursive: true})
  await fs.writeFile(outputPath, JSON.stringify(document))
}

void bootstrap();
