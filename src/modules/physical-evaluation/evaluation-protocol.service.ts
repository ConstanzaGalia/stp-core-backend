import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EvaluationProtocol } from 'src/entities/evaluation-protocol.entity';

const BOOTSTRAP_PROTOCOLS: Array<Partial<EvaluationProtocol> & { code: string; label: string; device: string; category: string }> = [
  { code: 'sprint_10m', label: 'Sprint 10 m', device: 'photocells', category: 'speed', config: { distanceMeters: 10, gates: [10], testType: 'photocell_sprint_10m' }, active: true, sortOrder: 10 },
  { code: 'sprint_20m', label: 'Sprint 20 m', device: 'photocells', category: 'speed', config: { distanceMeters: 20, gates: [10, 20], testType: 'photocell_sprint_20m' }, active: true, sortOrder: 20 },
  { code: 'sprint_30m', label: 'Sprint 30 m', device: 'photocells', category: 'speed', config: { distanceMeters: 30, gates: [10, 20, 30], testType: 'photocell_sprint_30m' }, active: true, sortOrder: 30 },
  { code: 'sprint_40m', label: 'Sprint 40 m', device: 'photocells', category: 'speed', config: { distanceMeters: 40, gates: [10, 20, 30, 40], testType: 'photocell_sprint_40m' }, active: true, sortOrder: 40 },
  { code: 'sprint_50m', label: 'Sprint 50 m', device: 'photocells', category: 'speed', config: { distanceMeters: 50, gates: [10, 20, 30, 40, 50], testType: 'photocell_sprint_50m' }, active: true, sortOrder: 50 },
  { code: 'flying_10m', label: 'Flying 10 m', device: 'photocells', category: 'speed', config: { distanceMeters: 10, gates: [10], testType: 'photocell_flying_10m' }, active: true, sortOrder: 60 },
  { code: 'flying_20m', label: 'Flying 20 m', device: 'photocells', category: 'speed', config: { distanceMeters: 20, gates: [10, 20], testType: 'photocell_flying_20m' }, active: true, sortOrder: 70 },
  { code: 't_test', label: 'T-Test', device: 'photocells', category: 'agility', config: { testType: 'photocell_t_test' }, active: true, sortOrder: 110 },
  { code: 'test_505', label: '505', device: 'photocells', category: 'agility', config: { testType: 'photocell_505' }, active: true, sortOrder: 120 },
  { code: 'illinois', label: 'Illinois', device: 'photocells', category: 'agility', config: { testType: 'photocell_illinois' }, active: true, sortOrder: 130 },
  { code: 'rast', label: 'RAST', device: 'photocells', category: 'resistance', config: { testType: 'photocell_rast' }, active: true, sortOrder: 210 },
  { code: 'rsa', label: 'RSA', device: 'photocells', category: 'resistance', config: { testType: 'photocell_rsa' }, active: true, sortOrder: 220 },
  {
    code: 'big_three_manual',
    label: 'Tres básicos (manual)',
    device: 'manual',
    category: 'strength',
    config: {
      testTypes: ['manual_squat', 'manual_bench', 'manual_deadlift'],
      lifts: ['squat', 'bench', 'deadlift'],
      formula: 'epley_rir_v1',
    },
    active: true,
    sortOrder: 300,
  },
];

@Injectable()
export class EvaluationProtocolService implements OnModuleInit {
  private cacheByDevice = new Map<string, { at: number; rows: EvaluationProtocol[] }>();
  private readonly cacheTtlMs = 60_000;

  constructor(
    @InjectRepository(EvaluationProtocol)
    private readonly protocolRepo: Repository<EvaluationProtocol>,
  ) {}

  async onModuleInit() {
    await this.ensureBootstrapSeed();
  }

  async ensureBootstrapSeed(): Promise<void> {
    for (const row of BOOTSTRAP_PROTOCOLS) {
      const existing = await this.protocolRepo.findOne({ where: { code: row.code } });
      if (existing) continue;
      await this.protocolRepo.save(
        this.protocolRepo.create({
          code: row.code,
          label: row.label,
          device: row.device,
          category: row.category,
          config: row.config ?? {},
          active: row.active ?? true,
          sortOrder: row.sortOrder ?? 0,
        }),
      );
    }
    this.cacheByDevice.clear();
  }

  async list(device?: string, activeOnly = true): Promise<EvaluationProtocol[]> {
    const key = `${device ?? 'all'}:${activeOnly ? '1' : '0'}`;
    const cached = this.cacheByDevice.get(key);
    if (cached && Date.now() - cached.at < this.cacheTtlMs) {
      return cached.rows;
    }

    const where: Record<string, unknown> = {};
    if (device) where.device = device;
    if (activeOnly) where.active = true;

    const rows = await this.protocolRepo.find({
      where,
      order: { sortOrder: 'ASC', label: 'ASC' },
    });
    this.cacheByDevice.set(key, { at: Date.now(), rows });
    return rows;
  }

  async findByCode(code: string): Promise<EvaluationProtocol | null> {
    return this.protocolRepo.findOne({ where: { code } });
  }

  async findActiveByDeviceAndCode(device: string, code: string): Promise<EvaluationProtocol | null> {
    return this.protocolRepo.findOne({ where: { device, code, active: true } });
  }
}
