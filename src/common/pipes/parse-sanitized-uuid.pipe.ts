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
        'ID inválido. Pegá el UUID completo del centro (36 caracteres con guiones), sin comillas.',
      );
    }
    return cleaned;
  }
}
