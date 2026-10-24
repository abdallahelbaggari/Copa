// Cloudflare Pages Function: handles every /api/* request.
import { handle } from '../../server/router.js';

export const onRequest = (context) => handle(context);
