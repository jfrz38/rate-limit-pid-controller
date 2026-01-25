import { Controller, Get, Headers } from '@nestjs/common';

@Controller()
export class AppController {
  constructor() {}

  @Get('/test')
  async getHello(@Headers() headers: Record<string, string>) {
    const executionTime = Number(headers['execution-time']) || 500;
    
    await new Promise(resolve => setTimeout(resolve, Number(executionTime)));

    return { message: 'Processed' };
  }
}
