import { Module } from '@nestjs/common';
import { TideQeaService } from './tide-qea.service';
import { DPoPModule } from '../auth/dpop/dpop.module';

@Module({
  imports: [DPoPModule],
  providers: [TideQeaService],
  exports: [TideQeaService],
})
export class TideModule {}
