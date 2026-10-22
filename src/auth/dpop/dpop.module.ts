import { Global, Module } from '@nestjs/common';
import { DPoPService } from './dpop.service';
import { DPoPReplayCacheService } from './dpop-replay-cache.service';
import { DPoPGuard } from './dpop.guard';

@Global()
@Module({
  providers: [DPoPService, DPoPReplayCacheService, DPoPGuard],
  exports: [DPoPService, DPoPReplayCacheService, DPoPGuard],
})
export class DPoPModule {}
