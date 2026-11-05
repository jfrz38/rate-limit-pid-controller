import { BadRequestException, Controller, Get, Headers } from '@nestjs/common';

const DEFAULT_EXECUTION_TIME_MS = 500;
const MAX_EXECUTION_TIME_MS = 60_000;

@Controller()
export class AppController {
  constructor() {}

  @Get('/test')
  async getHello(@Headers() headers: Record<string, string>) {
    const executionTimeHeader = headers['execution-time'];
    const executionTime =
      executionTimeHeader === undefined
        ? DEFAULT_EXECUTION_TIME_MS
        : Number(executionTimeHeader);

    if (
      !Number.isFinite(executionTime) ||
      executionTime < 0 ||
      executionTime > MAX_EXECUTION_TIME_MS
    ) {
      throw new BadRequestException(
        `execution-time must be between 0 and ${MAX_EXECUTION_TIME_MS}`,
      );
    }

    await new Promise(resolve => setTimeout(resolve, executionTime));

    return { message: 'Processed' };
  }
}
