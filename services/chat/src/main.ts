import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@chat/app.module';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

if (process.env.GLOBAL_AGENT_HTTP_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.GLOBAL_AGENT_HTTP_PROXY));
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3002',
    credentials: true,
  });

  const port = process.env.PORT ?? 4001;
  await app.listen(port);

  console.log(`Chat service running on http://localhost:${port}`);
}

void bootstrap();
