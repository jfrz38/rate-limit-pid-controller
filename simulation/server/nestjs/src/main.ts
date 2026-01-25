import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  console.log(`Try: curl -H "x-priority: 4" -H "execution-time: 2000" http://localhost:3000/test`);
}
bootstrap();
