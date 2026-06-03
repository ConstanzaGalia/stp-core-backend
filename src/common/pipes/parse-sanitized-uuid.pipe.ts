import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import {
  isValidUuidParam,
  sanitizeUuidParam,
} from '../helpers/uuid-param.helper';

@Injectable()
export class ParseSanitizedUUIDPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const cleaned = sanitizeUuidParam(value);
    if (!isValidUuidParam(cleaned)) {
      throw new BadRequestException(
        'ID inválido. Usá el UUID del centro sin comillas (ej. 7623d786-23a5-447b-b970-bb58ee2a70ac).',
      );
    }
    return cleaned;
  }
}
