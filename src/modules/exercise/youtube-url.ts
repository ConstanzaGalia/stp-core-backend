import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

export function parseYouTubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return id || null;
    }

    if (YOUTUBE_HOSTS.has(host)) {
      if (parsed.pathname.startsWith('/embed/')) {
        const id = parsed.pathname.split('/')[2];
        return id || null;
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.split('/')[2];
        return id || null;
      }
      return parsed.searchParams.get('v') || null;
    }
  } catch {
    return null;
  }

  return null;
}

export function isYouTubeVideoUrl(value: unknown): boolean {
  return typeof value === 'string' && parseYouTubeVideoId(value) !== null;
}

export function IsYouTubeVideoUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isYouTubeVideoUrl',
      target: object.constructor,
      propertyName,
      options: {
        message: 'La URL debe ser un video de YouTube',
        ...validationOptions,
      },
      validator: {
        validate: isYouTubeVideoUrl,
      },
    });
  };
}
