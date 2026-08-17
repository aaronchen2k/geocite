import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { DiagnosisConfigurationService } from './diagnosis-configuration.service';
import { GenerateDiagnosisQuestionsDto, SaveDiagnosisPromptDto, SaveDiagnosisQuestionsDto } from './diagnosis-configuration.dto';

@Controller('brands/:brandId/diagnosis-questions')
export class DiagnosisConfigurationController {
  constructor(private readonly service: DiagnosisConfigurationService) {}
  @Get() list(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.list(brandId); }
  @Post('prompt/reset') resetPrompt(@Param('brandId', ParseIntPipe) brandId: number) { return this.service.resetPrompt(brandId); }
  @Put('prompt') savePrompt(@Param('brandId', ParseIntPipe) brandId: number, @Body() dto: SaveDiagnosisPromptDto) { return this.service.savePrompt(brandId, dto.prompt); }
  @Put() save(@Param('brandId', ParseIntPipe) brandId: number, @Body() dto: SaveDiagnosisQuestionsDto) { return this.service.save(brandId, dto.questions, dto.prompt, dto.sitemapUrlLimit, dto.samplingQuestionCount, dto.questionCategoryRatio); }
  @Post('generate') generate(@Param('brandId', ParseIntPipe) brandId: number, @Body() dto: GenerateDiagnosisQuestionsDto) { return this.service.generate(brandId, dto.prompt); }
}
