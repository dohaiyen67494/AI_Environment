import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { DPoPModule } from './auth/dpop/dpop.module';
import { TideModule } from './tide/tide.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
    }),
    PrismaModule,
    DPoPModule,
    TideModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
