import { Injectable } from '@nestjs/common';
import { BaseUrl } from '../../constants/integrations';
import { PaginationDto } from './DTOs/pagination.dto';

@Injectable()
export class Pagination {
  limitRegex = /limit=\d+/;
  offsetRegex = /offset=\d+/;
  nextIdRegex = /nextId=\d+/;

  parseLimit(limit: string): number {
    return !isNaN(parseInt(limit)) ? parseInt(limit) : 15;
  }

  parseOffset(offset: string): number {
    return !isNaN(parseInt(offset)) ? parseInt(offset) : 0;
  }

  buildPaginationDto(
    limit: number,
    currentOffset: number,
    total: number,
    path: string,
    totalWithoutFilters?: number,
  ): PaginationDto {
    const response = new PaginationDto();
    response.limit = limit;
    response.offset = currentOffset;
    response.total = total;
    response.totalWithoutFilters = totalWithoutFilters;
    if (limit !== -1) {
      response.nextPage = limit + currentOffset < total ? this.buildNextPage(path, limit, currentOffset) : null;
    }

    return response;
  }

  buildNextPage(path: string, limit: number, currentOffset: number): string {
    let url = BaseUrl + path;

    if (this.limitRegex.test(url)) {
      url = url.replace(this.limitRegex, `limit=${limit}`);
    } else {
      url = `${url}${url.includes('?') ? '&' : '?'}limit=${limit}`;
    }

    if (this.offsetRegex.test(url)) {
      url = url.replace(this.offsetRegex, `offset=${currentOffset + limit}`);
    } else {
      url = `${url}${url.includes('?') ? '&' : '?'}offset=${currentOffset + limit}`;
    }

    return url;
  }

  buildPaginationDtoWithId(limit: number, path: string, collectionLength: number, nextId?: string): PaginationDto {
    const response = new PaginationDto();
    response.limit = limit;
    if (collectionLength >= limit) {
      response.nextId = nextId;
    }

    if (collectionLength >= limit && nextId) {
      response.nextPage = this.buildNextPageWithId(path, limit, nextId);
    }

    return response;
  }

  buildNextPageWithId(path: string, limit: number, nextId: string): string {
    let url = BaseUrl + path;

    if (this.limitRegex.test(url)) {
      url.replace(this.limitRegex, `limit=${limit}`);
    } else {
      url = `${url}${url.includes('?') ? '&' : '?'}limit=${limit}`;
    }

    if (this.nextIdRegex.test(url)) {
      url.replace(this.nextIdRegex, `nextId=${nextId}`);
    } else {
      url = `${url}${url.includes('?') ? '&' : '?'}nextId=${nextId}`;
    }

    return url;
  }
}
