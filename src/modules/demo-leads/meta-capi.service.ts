import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

export interface MetaServerEventInput {
  eventName: string;
  /** Mismo `eventID` que usó `fbq` en el navegador: Meta deduplica por este id. */
  eventId: string;
  eventSourceUrl?: string | null;
  email?: string | null;
  phoneE164?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Envía eventos a la Conversions API de Meta. Si faltan `META_PIXEL_ID` o
 * `META_CAPI_ACCESS_TOKEN` no hace nada. Nunca lanza: un fallo de Meta no
 * debe afectar el alta del lead.
 */
@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(this.pixelId() && this.accessToken());
  }

  async sendEvent(input: MetaServerEventInput): Promise<void> {
    if (!this.isEnabled()) return;

    const userData: Record<string, unknown> = {};
    if (input.email) userData.em = [sha256(input.email.trim().toLowerCase())];
    if (input.phoneE164) userData.ph = [sha256(input.phoneE164.replace(/\D/g, ''))];
    if (input.clientIp) userData.client_ip_address = input.clientIp;
    if (input.userAgent) userData.client_user_agent = input.userAgent;
    if (input.fbp) userData.fbp = input.fbp;
    if (input.fbc) userData.fbc = input.fbc;

    const body: Record<string, unknown> = {
      data: [
        {
          event_name: input.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          action_source: 'website',
          ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
          user_data: userData,
        },
      ],
    };
    const testCode = this.config.get<string>('META_CAPI_TEST_EVENT_CODE')?.trim();
    if (testCode) body.test_event_code = testCode;

    const version = this.config.get<string>('META_GRAPH_API_VERSION')?.trim() || 'v22.0';
    const url = `https://graph.facebook.com/${version}/${this.pixelId()}/events?access_token=${encodeURIComponent(this.accessToken()!)}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(`Meta CAPI ${input.eventName} respondió ${response.status}: ${text.slice(0, 300)}`);
      }
    } catch (error) {
      this.logger.warn(`Meta CAPI ${input.eventName} falló: ${(error as Error)?.message ?? error}`);
    }
  }

  private pixelId(): string | undefined {
    return this.config.get<string>('META_PIXEL_ID')?.trim() || undefined;
  }

  private accessToken(): string | undefined {
    return this.config.get<string>('META_CAPI_ACCESS_TOKEN')?.trim() || undefined;
  }
}
