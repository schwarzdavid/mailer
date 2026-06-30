import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = Symbol('PUBLIC_KEY');

export const Public = () => SetMetadata(PUBLIC_KEY, true);
