import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
          },
        },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
    appService = module.get<AppService>(AppService);
  });

  describe('health check', () => {
    it('should return health status with port 3333', async () => {
      const result = await appController.getHealth();
      expect(result).toEqual(
        expect.objectContaining({
          status: 'ok',
          service: 'CareFlow Backend API',
          port: 3333,
          database: 'connected',
        }),
      );
    });
  });
});
