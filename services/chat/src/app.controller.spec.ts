import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '@chat/app.controller';
import { AppService } from '@chat/app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return { ok: true }', () => {
      expect(appController.getHealth()).toEqual({ ok: true });
    });
  });

  describe('hello', () => {
    it('should return message with APP_NAME', () => {
      const result = appController.getHello();
      expect(result).toEqual({
        message: expect.stringContaining('Hello from Chat'),
      });
    });
  });
});
